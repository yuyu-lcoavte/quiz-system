import type Database from 'better-sqlite3';
import type { Result, RoundTargetReference, UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../errors/http-error.js';
import { validateResult, validateResultWinner } from '../../modules/sessions/domain/model-validation.js';
import { mapResult, type ResultRow } from './row-mappers.js';

export class ResultRepository {
  constructor(private readonly database: Database.Database) {}

  create(value: Result): Result {
    validateResult(value);
    const submission = this.database.prepare('SELECT round_id FROM submissions WHERE id = ?')
      .get(value.winningSubmissionId) as { round_id: string } | undefined;
    validateResultWinner(value.roundId, submission?.round_id ?? null);
    this.database.prepare('INSERT INTO results (id, round_id, winning_submission_id, created_at) VALUES (?, ?, ?, ?)')
      .run(value.id, value.roundId, value.winningSubmissionId, value.createdAt);
    return value;
  }

  findByRound(roundId: UUID): Result | null {
    const row = this.database.prepare('SELECT * FROM results WHERE round_id = ?').get(roundId) as ResultRow | undefined;
    return row ? mapResult(row) : null;
  }

  listByTarget(sessionId: UUID, target: RoundTargetReference): Result[] {
    const sql = target.kind === 'question'
      ? `SELECT res.* FROM results res JOIN rounds r ON r.id = res.round_id
         WHERE r.session_id = ? AND r.question_id = ? ORDER BY r.created_at, r.id`
      : `SELECT res.* FROM results res JOIN rounds r ON r.id = res.round_id
         WHERE r.session_id = ? AND r.question_group_id = ? ORDER BY r.created_at, r.id`;
    const id = target.kind === 'question' ? target.questionId : target.questionGroupId;
    return (this.database.prepare(sql).all(sessionId, id) as ResultRow[]).map(mapResult);
  }

  /** Replaces any prior logical-target result atomically. The caller supplies, but Foundation never selects, the winner. */
  replaceForTarget(value: Result): Result {
    const replace = this.database.transaction(() => {
      const round = this.database.prepare('SELECT id, session_id, question_id, question_group_id FROM rounds WHERE id = ?')
        .get(value.roundId) as { id: string; session_id: string; question_id: string | null; question_group_id: string | null } | undefined;
      if (!round) throw new HttpError(404, 'TARGET_NOT_FOUND', 'The Result Round does not exist.');
      const submission = this.database.prepare('SELECT round_id FROM submissions WHERE id = ?')
        .get(value.winningSubmissionId) as { round_id: string } | undefined;
      validateResultWinner(round.id, submission?.round_id ?? null);

      if (round.question_id) {
        this.database.prepare(`DELETE FROM results WHERE round_id IN
          (SELECT id FROM rounds WHERE session_id = ? AND question_id = ?)`).run(round.session_id, round.question_id);
      } else {
        this.database.prepare(`DELETE FROM results WHERE round_id IN
          (SELECT id FROM rounds WHERE session_id = ? AND question_group_id = ?)`).run(round.session_id, round.question_group_id);
      }
      return this.create(value);
    });
    return replace.immediate();
  }
}
