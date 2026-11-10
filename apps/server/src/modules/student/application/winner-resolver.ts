import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Result, UUID } from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { HttpError } from '../../../errors/http-error.js';

/** Read-only candidate selection on the caller's synchronous SQLite transaction. */
export class StudentWinnerResolver {
  constructor(private readonly database: Database.Database) {}

  resolveWinnerInTransaction(roundId: UUID): Result | null {
    if (!this.database.inTransaction) throw new Error('Winner resolution requires the caller transaction on the shared Database instance.');
    const repositories = createFoundationRepositories(this.database);
    if (!repositories.rounds.findById(roundId)) throw new HttpError(404, 'TARGET_NOT_FOUND', 'Round not found.');
    const winner = repositories.submissions.findFirstByRound(roundId);
    return winner ? { id: randomUUID() as UUID, roundId, winningSubmissionId: winner.id, createdAt: new Date().toISOString() } : null;
  }
}
