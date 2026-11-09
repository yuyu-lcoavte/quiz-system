import type Database from 'better-sqlite3';
import type { CurrentTargetView, RoundTargetReference, SessionSummary, UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { SessionStateService } from './session-state-service.js';

export class SessionQueryService {
  private readonly repositories;
  private readonly stateService: SessionStateService;
  constructor(private readonly database: Database.Database) {
    this.repositories = createFoundationRepositories(database);
    this.stateService = new SessionStateService(database);
  }

  lookupActivityCode(activityCode: string) {
    const session = this.repositories.sessions.findByActivityCode(activityCode);
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session code was not found.');
    const snapshot = this.stateService.getSnapshot(session.id)!;
    return { sessionId: session.id, phase: snapshot.phase };
  }

  getSession(sessionId: UUID): SessionSummary {
    const session = this.requireSession(sessionId);
    const snapshot = this.stateService.getSnapshot(sessionId)!;
    return { sessionId, activityCode: session.activityCode, phase: snapshot.phase, currentRoundId: session.currentRoundId, stateVersion: session.stateVersion };
  }

  getState(sessionId: UUID) {
    this.requireSession(sessionId);
    return this.stateService.getSnapshot(sessionId)!;
  }

  getCurrentTarget(sessionId: UUID): CurrentTargetView | null {
    const session = this.requireSession(sessionId);
    if (!session.currentRoundId) return null;
    const round = this.repositories.rounds.findById(session.currentRoundId);
    if (!round) throw new Error('Session currentRoundId references a missing Round.');
    if (round.questionId) {
      const question = this.repositories.questions.findById(round.questionId);
      if (!question) throw new Error('Round references a missing Question.');
      return { roundId: round.id, target: { kind: 'question', question } };
    }
    const questionGroup = this.repositories.questionGroups.findById(round.questionGroupId!);
    if (!questionGroup) throw new Error('Round references a missing QuestionGroup.');
    return { roundId: round.id, target: { kind: 'questionGroup', questionGroup } };
  }

  getResults(sessionId: UUID) {
    const session = this.requireSession(sessionId);
    if (!session.currentRoundId) return [];
    const round = this.repositories.rounds.findById(session.currentRoundId);
    if (!round) throw new Error('Session currentRoundId references a missing Round.');
    const target: RoundTargetReference = round.questionId
      ? { kind: 'question', questionId: round.questionId }
      : { kind: 'questionGroup', questionGroupId: round.questionGroupId! };
    return this.repositories.results.listByTarget(sessionId, target);
  }

  isTeamInSession(teamId: UUID, sessionId: UUID): boolean {
    const row = this.database.prepare('SELECT 1 FROM teams WHERE id = ? AND session_id = ?').get(teamId, sessionId);
    return Boolean(row);
  }

  private requireSession(sessionId: UUID) {
    const session = this.repositories.sessions.findById(sessionId);
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    return session;
  }
}
