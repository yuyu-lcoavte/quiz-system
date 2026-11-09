import type Database from 'better-sqlite3';
import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';

/** Reads the authoritative phase snapshot; target references intentionally omit question content. */
export class SessionStateService {
  constructor(private readonly database: Database.Database) {}

  getSnapshot(sessionId: UUID): SessionStateSnapshot | null {
    const repositories = createFoundationRepositories(this.database);
    const session = repositories.sessions.findById(sessionId);
    if (!session) return null;
    if (!session.currentRoundId) {
      return { sessionId, phase: 'Waiting', currentRoundId: null, target: null, stateVersion: session.stateVersion, changedAt: session.createdAt };
    }
    const round = repositories.rounds.findById(session.currentRoundId);
    if (!round) throw new Error('Session currentRoundId references a missing Round.');
    const changedAt = round.phase === 'Waiting' ? round.createdAt : round.phase === 'Active' ? round.startedAt : round.endedAt;
    if (!changedAt) throw new Error(`Round ${round.id} is missing its ${round.phase} timestamp.`);
    const target = round.questionId
      ? { kind: 'question' as const, questionId: round.questionId }
      : { kind: 'questionGroup' as const, questionGroupId: round.questionGroupId! };
    return { sessionId, phase: round.phase, currentRoundId: round.id, target, stateVersion: session.stateVersion, changedAt };
  }
}
