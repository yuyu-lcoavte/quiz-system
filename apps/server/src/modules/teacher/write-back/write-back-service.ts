import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import type { SheetConflictCell, WriteBackEntryView, WriteBackPlanView } from '@quiz/contracts';
import { HttpError } from '../../../errors/http-error.js';
import type { TeacherBlankCell, TeacherRepositories } from '../persistence/index.js';
import { requireGateway, type SheetsGateway } from '../sheets/sheets-gateway.js';
import { composeCell } from './cell-composer.js';

interface PlannedCell {
  readonly cellA1: string;
  readonly expectedContent: string;
  readonly newContent: string;
  readonly kind: 'write' | 'restore';
  readonly number: string;
}

/**
 * One write-back of every target with a current winner, plus restores (FR-033–FR-036, research.md R13).
 * Preview reads the live cells and saves nothing; confirm re-plans, requires the same digest, re-reads the cells and
 * writes all of them in one batch only if every cell still holds what this system expects.
 */
export class WriteBackService {
  private readonly winners;
  private readonly numbers;

  constructor(
    database: Database.Database,
    private readonly teacher: TeacherRepositories,
    private readonly gateway: SheetsGateway | null,
    private readonly now: () => Date,
  ) {
    // Only the latest Round of a target keeps a Result row, so these are the current winners.
    this.winners = database.prepare(`SELECT sa.blank_id, sa.value FROM results r
      JOIN rounds ro ON ro.id = r.round_id
      JOIN submission_answers sa ON sa.submission_id = r.winning_submission_id
      WHERE ro.session_id = ?`);
    this.numbers = database.prepare(`SELECT b.id AS blank_id, q.display_number AS number
      FROM blanks b JOIN questions q ON q.id = b.question_id WHERE q.session_id = ?`);
  }

  async preview(sessionId: UUID): Promise<WriteBackPlanView> {
    const { source, plan, planDigest } = this.plan(sessionId);
    if (plan.length === 0) throw new HttpError(409, 'NOTHING_TO_WRITE', 'There is nothing to write back.');
    const current = await requireGateway(this.gateway).readCells(source, plan.map((entry) => entry.cellA1));
    const entries: WriteBackEntryView[] = plan.map((entry) => ({
      cellA1: entry.cellA1,
      currentContent: current[entry.cellA1] ?? '',
      newContent: entry.newContent,
      kind: entry.kind,
      number: entry.number,
    }));
    return { entries, planDigest };
  }

  async confirm(sessionId: UUID, planDigest: string): Promise<{ written: number }> {
    const { source, plan, planDigest: actual } = this.plan(sessionId);
    if (actual !== planDigest) throw new HttpError(409, 'STALE_STATE', 'Results changed after the preview; preview again.');
    if (plan.length === 0) throw new HttpError(409, 'NOTHING_TO_WRITE', 'There is nothing to write back.');
    const gateway = requireGateway(this.gateway);
    const current = await gateway.readCells(source, plan.map((entry) => entry.cellA1));
    const conflicts: SheetConflictCell[] = plan
      .filter((entry) => current[entry.cellA1] !== entry.expectedContent)
      .map((entry) => ({ cellA1: entry.cellA1, expected: entry.expectedContent, actual: current[entry.cellA1] ?? null }));
    if (conflicts.length > 0) {
      throw new HttpError(409, 'SHEET_CONFLICT', 'Some cells changed in the spreadsheet; nothing was written.', { cells: conflicts });
    }
    // Known limit (research.md R11): Sheets has no compare-and-set, so a change between this read and the write is not detected.
    await gateway.writeCells(source, plan.map((entry) => ({ cellA1: entry.cellA1, text: entry.newContent })));
    const writtenAt = this.now().toISOString();
    for (const entry of plan) this.teacher.blankCells.recordWritten(sessionId, entry.cellA1, entry.newContent, writtenAt);
    return { written: plan.length };
  }

  private plan(sessionId: UUID) {
    const sourceRow = this.teacher.sheetSources.find(sessionId);
    if (!sourceRow) throw new HttpError(409, 'NOT_IMPORTED', 'This activity was not imported from Google Sheets.');
    const answers = new Map((this.winners.all(sessionId) as { blank_id: string; value: string }[]).map((row) => [row.blank_id, row.value]));
    const numbers = new Map((this.numbers.all(sessionId) as { blank_id: string; number: string | null }[]).map((row) => [row.blank_id, row.number ?? '']));

    const byCell = new Map<string, TeacherBlankCell[]>();
    for (const cell of this.teacher.blankCells.listBySession(sessionId)) {
      byCell.set(cell.cellA1, [...(byCell.get(cell.cellA1) ?? []), cell]);
    }

    const plan: PlannedCell[] = [];
    for (const [cellA1, blanks] of byCell) {
      const original = blanks[0].originalContent;
      const expectedContent = blanks[0].lastWrittenContent ?? original;
      const withAnswers = blanks.filter((blank) => answers.has(blank.blankId))
        .map((blank) => ({ markerIndex: blank.markerIndex, answer: answers.get(blank.blankId)! }));
      let kind: PlannedCell['kind'];
      let newContent: string;
      if (withAnswers.length > 0) {
        kind = 'write';
        newContent = composeCell(original, withAnswers);
      } else if (blanks[0].lastWrittenContent !== null) {
        kind = 'restore';
        newContent = original;
      } else {
        continue; // never written and no winner: leave the cell alone (FR-036)
      }
      if (newContent === expectedContent) continue; // already up to date
      plan.push({ cellA1, expectedContent, newContent, kind, number: numbers.get(blanks[0].blankId) ?? '' });
    }
    plan.sort((a, b) => compareCells(a.cellA1, b.cellA1));
    const source = { spreadsheetId: sourceRow.spreadsheetId, sheetId: sourceRow.sheetId };
    const planDigest = createHash('sha256').update(JSON.stringify({ source, plan })).digest('hex');
    return { source, plan, planDigest };
  }
}

/** Row first, then column (G5 < G6 < G11 < AA2…). */
function compareCells(a: string, b: string): number {
  const parse = (cell: string) => {
    const match = /^([A-Z]+)(\d+)$/.exec(cell)!;
    let column = 0;
    for (const char of match[1]) column = column * 26 + (char.charCodeAt(0) - 64);
    return { row: Number(match[2]), column };
  };
  const left = parse(a);
  const right = parse(b);
  return left.row - right.row || left.column - right.column;
}
