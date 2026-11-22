import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Result, RoundTargetReference, SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import {
  createWaitingRound,
  endRoundWithResult,
  endRoundWithWinnerResolver,
  type FoundationLifecycleEndInput,
  type WinnerResolver,
} from './foundation-transactions.js';
import { SessionStateService } from './session-state-service.js';

export interface SessionLifecycleOptions {
  now?: () => string;
  createId?: () => UUID;
  publish?: (snapshot: SessionStateSnapshot) => void;
}

export interface FoundationLifecycleEndPort {
  endRoundWithWinnerResolver(input: FoundationLifecycleEndInput, resolveWinner: WinnerResolver): SessionStateSnapshot;
}

/** Trusted server-to-server lifecycle primitive. Command authorization/UI belong to Teacher Feature. */
export class SessionLifecycleService implements FoundationLifecycleEndPort {
  private readonly state: SessionStateService;
  private readonly now: () => string;
  private readonly createId: () => UUID;
  constructor(private readonly database: Database.Database, private readonly options: SessionLifecycleOptions = {}) {
    this.state = new SessionStateService(database);
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => randomUUID() as UUID);
  }

  selectTarget(sessionId: UUID, target: RoundTargetReference, expectedStateVersion: number): SessionStateSnapshot {
    createWaitingRound(this.database, { id: this.createId(), sessionId, target, createdAt: this.now(), expectedStateVersion });
    return this.committedSnapshot(sessionId);
  }

  startRound(sessionId: UUID, expectedStateVersion: number): SessionStateSnapshot {
    const repositories = createFoundationRepositories(this.database);
    const now = this.now();
    const transaction = this.database.transaction(() => {
      const session = repositories.sessions.findById(sessionId);
      if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
      if (!session.currentRoundId) throw new HttpError(409, 'INVALID_PHASE', 'There is no current Round to start.');
      const round = repositories.rounds.findById(session.currentRoundId);
      if (!round) throw new Error('Session currentRoundId references a missing Round.');
      if (round.phase !== 'Waiting') throw new HttpError(409, 'INVALID_PHASE', 'Only a Waiting Round can be started.');
      const updated = this.database.prepare("UPDATE rounds SET phase = 'Active', started_at = ? WHERE id = ? AND phase = 'Waiting'").run(now, round.id);
      if (updated.changes !== 1) throw new HttpError(409, 'INVALID_PHASE', 'The Round is no longer Waiting.');
      const sessionUpdate = this.database.prepare('UPDATE sessions SET state_version = state_version + 1 WHERE id = ? AND current_round_id = ? AND state_version = ?')
        .run(sessionId, round.id, expectedStateVersion);
      if (sessionUpdate.changes !== 1) throw new HttpError(409, 'STALE_STATE', 'The Session changed before the Round could start.');
    });
    transaction.immediate();
    return this.committedSnapshot(sessionId);
  }

  endRound(sessionId: UUID, expectedStateVersion: number, result?: Result): SessionStateSnapshot {
    const repositories = createFoundationRepositories(this.database);
    const session = repositories.sessions.findById(sessionId);
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    if (!session.currentRoundId) throw new HttpError(409, 'INVALID_PHASE', 'There is no current Round to end.');
    endRoundWithResult(this.database, { roundId: session.currentRoundId, endedAt: this.now(), expectedStateVersion, result });
    return this.committedSnapshot(sessionId);
  }

  endRoundWithWinnerResolver(input: FoundationLifecycleEndInput, resolveWinner: WinnerResolver): SessionStateSnapshot {
    const snapshot = endRoundWithWinnerResolver(this.database, input, resolveWinner, this.now());
    const logFailure = (error: unknown) => {
      console.error('Session End notification failed after commit.', {
        sessionId: snapshot.sessionId,
        stateVersion: snapshot.stateVersion,
        requestId: input.requestId,
        errorName: error instanceof Error ? error.name : 'Unknown error',
      });
    };
    try {
      const notification: unknown = this.options.publish?.(snapshot);
      // Callers may return delivery work, but the synchronous End never waits for it.
      if (notification && typeof (notification as { then?: unknown }).then === 'function') {
        void Promise.resolve(notification).catch(logFailure);
      }
    } catch (error) {
      logFailure(error);
    }
    return snapshot;
  }

  private committedSnapshot(sessionId: UUID): SessionStateSnapshot {
    const snapshot = this.state.getSnapshot(sessionId);
    if (!snapshot) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    this.options.publish?.(snapshot);
    return snapshot;
  }
}
