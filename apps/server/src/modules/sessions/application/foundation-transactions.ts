import type Database from 'better-sqlite3';
import { parseUUID, type Result, type Round, type RoundTargetReference, type Session, type UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import { validateQuestionGroupTarget, validateRoundTargetShape, validateSameSession } from '../domain/model-validation.js';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';

export interface CreateWaitingRoundInput {
  id: UUID;
  sessionId: UUID;
  target: RoundTargetReference;
  createdAt: string;
  expectedStateVersion: number;
}

export interface CreateWaitingRoundResult {
  round: Round;
  session: Session;
}

export interface EndRoundInput {
  roundId: UUID;
  endedAt: string;
  expectedStateVersion: number;
  /** Supplied by the feature that owns winner determination; omitted when there is no winner. */
  result?: Result;
}

export interface EndRoundResult {
  round: Round;
  session: Session;
  result: Result | null;
}

export function createWaitingRound(
  database: Database.Database,
  input: CreateWaitingRoundInput,
): CreateWaitingRoundResult {
  const repositories = createFoundationRepositories(database);
  const transaction = database.transaction((): CreateWaitingRoundResult => {
    if (!parseUUID(input.id) || !parseUUID(input.sessionId)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Round and Session identifiers must be UUIDs.');
    }
    validateRoundTargetShape(
      input.target.kind === 'question' ? input.target.questionId : null,
      input.target.kind === 'questionGroup' ? input.target.questionGroupId : null,
    );
    const currentSession = repositories.sessions.findById(input.sessionId);
    if (!currentSession) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    if (currentSession.currentRoundId) {
      const currentRound = repositories.rounds.findById(currentSession.currentRoundId);
      if (!currentRound) throw new Error('Session currentRoundId references a missing Round.');
      if (currentRound.phase !== 'Ended') {
        throw new HttpError(409, 'INVALID_PHASE', 'A new Round can be selected only when there is no current Round or the current Round has ended.');
      }
    }

    let targetId: UUID;
    let targetSessionId: UUID;
    if (input.target.kind === 'question') {
      targetId = input.target.questionId;
      const target = database.prepare('SELECT id, session_id FROM questions WHERE id = ?').get(targetId) as { id: string; session_id: string } | undefined;
      if (!target) throw new HttpError(404, 'TARGET_NOT_FOUND', 'The Question does not exist.');
      targetSessionId = target.session_id as UUID;
    } else {
      targetId = input.target.questionGroupId;
      const target = database.prepare(`SELECT g.id, g.session_id, COUNT(q.id) AS question_count
        FROM question_groups g LEFT JOIN questions q ON q.question_group_id = g.id
        WHERE g.id = ? GROUP BY g.id`).get(targetId) as { id: string; session_id: string; question_count: number } | undefined;
      if (!target) throw new HttpError(404, 'TARGET_NOT_FOUND', 'The QuestionGroup does not exist.');
      validateQuestionGroupTarget(target.question_count);
      targetSessionId = target.session_id as UUID;
    }
    validateSameSession(currentSession.id, targetSessionId, 'Round target and Session');

    const round: Round = input.target.kind === 'question'
      ? { id: input.id, sessionId: input.sessionId, questionId: input.target.questionId, questionGroupId: null, phase: 'Waiting', createdAt: input.createdAt, startedAt: null, endedAt: null }
      : { id: input.id, sessionId: input.sessionId, questionId: null, questionGroupId: input.target.questionGroupId, phase: 'Waiting', createdAt: input.createdAt, startedAt: null, endedAt: null };
    repositories.rounds.create(round);

    const update = database.prepare(`UPDATE sessions SET current_round_id = ?, state_version = state_version + 1
      WHERE id = ? AND state_version = ?`).run(input.id, input.sessionId, input.expectedStateVersion);
    if (update.changes !== 1) throw new HttpError(409, 'STALE_STATE', 'The Session changed before the Round could be selected.');

    const updatedSession = repositories.sessions.findById(input.sessionId);
    if (!updatedSession) throw new Error('Session disappeared during its Round transaction.');
    return { round, session: updatedSession };
  });

  return transaction.immediate();
}

/** Commits the shared Ended state and supplied Result together; it never chooses a winner or computes order. */
export function endRoundWithResult(database: Database.Database, input: EndRoundInput): EndRoundResult {
  const repositories = createFoundationRepositories(database);
  const transaction = database.transaction((): EndRoundResult => {
    const current = database.prepare(`SELECT r.*, s.state_version
      FROM rounds r JOIN sessions s ON s.id = r.session_id WHERE r.id = ?`).get(input.roundId) as
      ({ id: string; session_id: string; question_id: string | null; question_group_id: string | null; phase: 'Waiting' | 'Active' | 'Ended'; created_at: string; started_at: string | null; ended_at: string | null; state_version: number }) | undefined;
    if (!current) throw new HttpError(404, 'TARGET_NOT_FOUND', 'The Round does not exist.');
    if (current.phase !== 'Active') throw new HttpError(409, 'INVALID_PHASE', 'Only an Active Round can be ended.');

    const updateRound = database.prepare(`UPDATE rounds SET phase = 'Ended', ended_at = ?
      WHERE id = ? AND phase = 'Active'`).run(input.endedAt, input.roundId);
    if (updateRound.changes !== 1) throw new HttpError(409, 'INVALID_PHASE', 'The Round is no longer Active.');
    const updateSession = database.prepare(`UPDATE sessions SET state_version = state_version + 1
      WHERE id = ? AND current_round_id = ? AND state_version = ?`)
      .run(current.session_id, input.roundId, input.expectedStateVersion);
    if (updateSession.changes !== 1) throw new HttpError(409, 'STALE_STATE', 'The Session changed before the Round could end.');

    if (input.result) {
      if (input.result.roundId !== input.roundId) {
        throw new HttpError(400, 'INVALID_INPUT', 'The supplied Result must refer to the Round being ended.');
      }
      repositories.results.replaceForTarget(input.result);
    } else {
      // Reopening the logical target must not expose a prior Round's result when this Round has no winner.
      const target = repositories.rounds.findById(input.roundId);
      if (!target) throw new Error('Round disappeared during its End transaction.');
      if (target.questionId) {
        database.prepare(`DELETE FROM results WHERE round_id IN
          (SELECT id FROM rounds WHERE session_id = ? AND question_id = ?)`).run(target.sessionId, target.questionId);
      } else {
        database.prepare(`DELETE FROM results WHERE round_id IN
          (SELECT id FROM rounds WHERE session_id = ? AND question_group_id = ?)`).run(target.sessionId, target.questionGroupId);
      }
    }

    const round = repositories.rounds.findById(input.roundId);
    const session = repositories.sessions.findById(current.session_id as UUID);
    const result = repositories.results.findByRound(input.roundId);
    if (!round || !session) throw new Error('Round or Session disappeared during its End transaction.');
    return { round, session, result };
  });
  return transaction.immediate();
}
