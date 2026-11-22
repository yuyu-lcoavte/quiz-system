import type Database from 'better-sqlite3';
import type { RoundPhase, RoundTargetReference, UUID } from '@quiz/contracts/domain';
import type { TargetStatus, TargetStatusView } from '@quiz/contracts';

export interface CatalogTarget extends TargetStatusView {
  readonly position: number;
  /** At least one Question and every Question has at least one Blank. */
  readonly answerable: boolean;
}

interface TargetRow {
  id: string; kind: 'question' | 'questionGroup'; number: string | null; position: number;
  question_count: number; blank_count: number; questions_without_blank: number;
}

/**
 * Targets of a Session = standalone Questions + QuestionGroups, in one position sequence (data-model.md).
 * Status = phase of the target's latest Round, or NotOpened.
 */
export class TargetCatalog {
  private readonly targetsQuery;
  private readonly latestRound;
  private readonly roundCount;
  private readonly hasResult;

  constructor(database: Database.Database) {
    this.targetsQuery = database.prepare(`
      SELECT q.id, 'question' AS kind, q.display_number AS number, q.position,
             1 AS question_count,
             (SELECT COUNT(*) FROM blanks b WHERE b.question_id = q.id) AS blank_count,
             CASE WHEN EXISTS (SELECT 1 FROM blanks b WHERE b.question_id = q.id) THEN 0 ELSE 1 END AS questions_without_blank
        FROM questions q WHERE q.session_id = ? AND q.question_group_id IS NULL
      UNION ALL
      SELECT g.id, 'questionGroup' AS kind, g.label AS number, g.position,
             (SELECT COUNT(*) FROM questions q WHERE q.question_group_id = g.id) AS question_count,
             (SELECT COUNT(*) FROM blanks b JOIN questions q ON q.id = b.question_id WHERE q.question_group_id = g.id) AS blank_count,
             (SELECT COUNT(*) FROM questions q WHERE q.question_group_id = g.id
                AND NOT EXISTS (SELECT 1 FROM blanks b WHERE b.question_id = q.id)) AS questions_without_blank
        FROM question_groups g WHERE g.session_id = ?
      ORDER BY position, kind DESC, id`);
    const byTarget = 'session_id = ? AND (question_id = ? OR question_group_id = ?)';
    this.latestRound = database.prepare(`SELECT phase FROM rounds WHERE ${byTarget} ORDER BY created_at DESC, rowid DESC LIMIT 1`);
    this.roundCount = database.prepare(`SELECT COUNT(*) AS n FROM rounds WHERE ${byTarget}`);
    this.hasResult = database.prepare(`SELECT 1 FROM results r JOIN rounds ro ON ro.id = r.round_id
      WHERE ro.session_id = ? AND (ro.question_id = ? OR ro.question_group_id = ?) LIMIT 1`);
  }

  targets(sessionId: UUID): CatalogTarget[] {
    const rows = this.targetsQuery.all(sessionId, sessionId) as TargetRow[];
    return rows.map((row) => {
      const id = row.id as UUID;
      const latest = this.latestRound.get(sessionId, id, id) as { phase: RoundPhase } | undefined;
      const target: RoundTargetReference = row.kind === 'question'
        ? { kind: 'question', questionId: id }
        : { kind: 'questionGroup', questionGroupId: id };
      return {
        target,
        number: row.number ?? String(row.position + 1),
        kind: row.kind,
        questionCount: row.question_count,
        blankCount: row.blank_count,
        status: (latest?.phase ?? 'NotOpened') as TargetStatus,
        roundCount: (this.roundCount.get(sessionId, id, id) as { n: number }).n,
        hasResult: Boolean(this.hasResult.get(sessionId, id, id)),
        position: row.position,
        answerable: row.question_count > 0 && row.questions_without_blank === 0,
      };
    });
  }

  /** The target only if it belongs to this Session. */
  find(sessionId: UUID, target: RoundTargetReference): CatalogTarget | null {
    const id = target.kind === 'question' ? target.questionId : target.questionGroupId;
    return this.targets(sessionId).find((entry) => entry.kind === target.kind && targetId(entry) === id) ?? null;
  }

  /** First target that has never been opened, in position order. */
  next(sessionId: UUID): CatalogTarget | null {
    return this.targets(sessionId).find((entry) => entry.status === 'NotOpened') ?? null;
  }
}

export function targetId(entry: Pick<CatalogTarget, 'target'>): UUID {
  return entry.target.kind === 'question' ? entry.target.questionId : entry.target.questionGroupId;
}

/** API view without internal fields. */
export function toTargetStatusView(entry: CatalogTarget): TargetStatusView {
  const { position: _position, answerable: _answerable, ...view } = entry;
  return view;
}
