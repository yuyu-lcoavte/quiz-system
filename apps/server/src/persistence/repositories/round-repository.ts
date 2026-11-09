import type Database from 'better-sqlite3';
import type { Round, UUID } from '@quiz/contracts/domain';
import { validateQuestionGroupTarget, validateRoundTargetShape, validateSameSession } from '../../modules/sessions/domain/model-validation.js';
import { mapRound, type RoundRow } from './row-mappers.js';

export class RoundRepository {
  constructor(private readonly database: Database.Database) {}

  create(value: Round): Round {
    validateRoundTargetShape(value.questionId ?? null, value.questionGroupId ?? null);
    if (value.questionId) {
      const target = this.database.prepare('SELECT session_id FROM questions WHERE id = ?').get(value.questionId) as { session_id: string } | undefined;
      if (!target) throw new Error('Round Question target must exist.');
      validateSameSession(value.sessionId, target.session_id, 'Round target and Session');
    } else if (value.questionGroupId) {
      const target = this.database.prepare(`SELECT g.session_id, COUNT(q.id) AS question_count
        FROM question_groups g LEFT JOIN questions q ON q.question_group_id = g.id
        WHERE g.id = ? GROUP BY g.id`).get(value.questionGroupId) as { session_id: string; question_count: number } | undefined;
      if (!target) throw new Error('Round QuestionGroup target must exist.');
      validateSameSession(value.sessionId, target.session_id, 'Round target and Session');
      validateQuestionGroupTarget(target.question_count);
    }
    this.database.prepare(`INSERT INTO rounds (id, session_id, question_id, question_group_id, phase, created_at, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(value.id, value.sessionId, value.questionId ?? null, value.questionGroupId ?? null,
      value.phase, value.createdAt, value.startedAt ?? null, value.endedAt ?? null);
    return value;
  }

  findById(id: UUID): Round | null {
    const row = this.database.prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow | undefined;
    return row ? mapRound(row) : null;
  }

  listBySession(sessionId: UUID): Round[] {
    const rows = this.database.prepare('SELECT * FROM rounds WHERE session_id = ? ORDER BY created_at, id').all(sessionId) as RoundRow[];
    return rows.map(mapRound);
  }
}
