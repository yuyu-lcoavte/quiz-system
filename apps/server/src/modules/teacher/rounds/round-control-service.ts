import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { RoundTargetReference, SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import type { TeacherServiceDependencies } from '../../../app.js';
import { HttpError } from '../../../errors/http-error.js';
import { TargetCatalog } from './target-catalog.js';

/**
 * Teacher commands over Foundation's lifecycle. End is one call to the Student trusted coordinator;
 * the Teacher never selects a winner (student-teacher-decisions.md 5.1, research.md R8/R9).
 */
export class RoundControlService {
  private readonly catalog: TargetCatalog;
  private readonly currentRound;

  constructor(private readonly services: TeacherServiceDependencies, database: Database.Database = services.database) {
    this.catalog = new TargetCatalog(database);
    this.currentRound = database.prepare('SELECT current_round_id FROM sessions WHERE id = ?');
  }

  select(sessionId: UUID, target: RoundTargetReference, expectedStateVersion: number): SessionStateSnapshot {
    const entry = this.catalog.find(sessionId, target);
    if (!entry) throw new HttpError(404, 'TARGET_NOT_FOUND', 'The target does not exist in this activity.');
    if (!entry.answerable) throw new HttpError(422, 'TARGET_NOT_ANSWERABLE', 'The target has no answerable blank.');
    return this.services.sessionLifecycle.selectTarget(sessionId, entry.target, expectedStateVersion);
  }

  next(sessionId: UUID, expectedStateVersion: number): SessionStateSnapshot {
    if (this.catalog.targets(sessionId).length === 0) throw new HttpError(409, 'NO_QUESTIONS', 'Import questions before opening a round.');
    const entry = this.catalog.next(sessionId);
    if (!entry) throw new HttpError(409, 'NO_NEXT_TARGET', 'Every question has already been opened.');
    return this.select(sessionId, entry.target, expectedStateVersion);
  }

  start(sessionId: UUID, expectedStateVersion: number): SessionStateSnapshot {
    return this.services.sessionLifecycle.startRound(sessionId, expectedStateVersion);
  }

  end(sessionId: UUID, expectedStateVersion: number, actor: ActorContext): SessionStateSnapshot {
    const row = this.currentRound.get(sessionId) as { current_round_id: string | null } | undefined;
    if (!row) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    if (!row.current_round_id) throw new HttpError(409, 'INVALID_PHASE', 'There is no current Round to end.');
    return this.services.endCoordinator.endRound(
      { sessionId, roundId: row.current_round_id as UUID, expectedStateVersion, requestId: randomUUID() },
      actor,
    );
  }
}
