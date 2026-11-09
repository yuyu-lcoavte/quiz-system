import type Database from 'better-sqlite3';
import type { Submission, SubmissionAnswer, UUID } from '@quiz/contracts/domain';
import { validateBlankTargetMembership, validateSameSession, validateSubmission, validateSubmissionAnswer } from '../../modules/sessions/domain/model-validation.js';
import { mapSubmission, mapSubmissionAnswer, type SubmissionAnswerRow, type SubmissionRow } from './row-mappers.js';

export class SubmissionRepository {
  constructor(private readonly database: Database.Database) {}

  /** acceptedOrder must come from the trusted Student Feature backend acceptance service, never from a client. */
  create(value: Submission): Submission {
    validateSubmission(value);
    const relation = this.database.prepare(`SELECT t.session_id AS team_session_id, r.session_id AS round_session_id
      FROM teams t JOIN rounds r ON r.id = ? WHERE t.id = ?`).get(value.roundId, value.teamId) as { team_session_id: string; round_session_id: string } | undefined;
    if (!relation) throw new Error('Submission Team and Round must exist.');
    validateSameSession(relation.team_session_id, relation.round_session_id, 'Submission Team and Round');
    this.database.prepare(`INSERT INTO submissions (id, team_id, round_id, received_at, accepted_order)
      VALUES (?, ?, ?, ?, ?)`).run(value.id, value.teamId, value.roundId, value.receivedAt, value.acceptedOrder);
    return value;
  }

  findById(id: UUID): Submission | null {
    const row = this.database.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as SubmissionRow | undefined;
    return row ? mapSubmission(row) : null;
  }
}

export class SubmissionAnswerRepository {
  constructor(private readonly database: Database.Database) {}

  create(value: SubmissionAnswer): SubmissionAnswer {
    validateSubmissionAnswer(value);
    const membership = this.database.prepare(`SELECT 1
      FROM submissions s JOIN rounds r ON r.id = s.round_id
      JOIN blanks b ON b.id = ? JOIN questions q ON q.id = b.question_id
      WHERE s.id = ? AND (
        (r.question_id IS NOT NULL AND q.id = r.question_id)
        OR (r.question_group_id IS NOT NULL AND q.question_group_id = r.question_group_id AND q.session_id = r.session_id)
      )`).get(value.blankId, value.submissionId);
    validateBlankTargetMembership(Boolean(membership));
    this.database.prepare('INSERT INTO submission_answers (submission_id, blank_id, value) VALUES (?, ?, ?)')
      .run(value.submissionId, value.blankId, value.value);
    return value;
  }

  listBySubmission(submissionId: UUID): SubmissionAnswer[] {
    const rows = this.database.prepare(`SELECT sa.*
      FROM submission_answers sa
      JOIN blanks b ON b.id = sa.blank_id
      JOIN questions q ON q.id = b.question_id
      WHERE sa.submission_id = ?
      ORDER BY q.position, q.id, b.position, b.id`).all(submissionId) as SubmissionAnswerRow[];
    return rows.map(mapSubmissionAnswer);
  }
}
