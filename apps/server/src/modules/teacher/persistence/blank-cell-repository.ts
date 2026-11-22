import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';

export interface TeacherBlankCell {
  readonly blankId: UUID;
  readonly sessionId: UUID;
  readonly cellA1: string;
  readonly originalContent: string;
  readonly marker: string | null;
  readonly markerIndex: number;
  readonly lastWrittenContent: string | null;
  readonly lastWrittenAt: string | null;
}

export type NewTeacherBlankCell = Omit<TeacherBlankCell, 'lastWrittenContent' | 'lastWrittenAt'>;

interface BlankCellRow {
  blank_id: string; session_id: string; cell_a1: string; original_content: string; marker: string | null;
  marker_index: number; last_written_content: string | null; last_written_at: string | null;
}

/** Source cell of each imported Blank, used for write-back. */
export class TeacherBlankCellRepository {
  constructor(private readonly database: Database.Database) {}

  create(cell: NewTeacherBlankCell): void {
    this.database.prepare(`INSERT INTO teacher_blank_cells (blank_id, session_id, cell_a1, original_content, marker, marker_index)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(cell.blankId, cell.sessionId, cell.cellA1, cell.originalContent, cell.marker, cell.markerIndex);
  }

  listBySession(sessionId: UUID): TeacherBlankCell[] {
    const rows = this.database.prepare(`SELECT * FROM teacher_blank_cells WHERE session_id = ?
      ORDER BY cell_a1, marker_index`).all(sessionId) as BlankCellRow[];
    return rows.map((row) => ({
      blankId: row.blank_id as UUID,
      sessionId: row.session_id as UUID,
      cellA1: row.cell_a1,
      originalContent: row.original_content,
      marker: row.marker,
      markerIndex: row.marker_index,
      lastWrittenContent: row.last_written_content,
      lastWrittenAt: row.last_written_at,
    }));
  }

  /** Records the text written to one cell; applies to every Blank sharing that cell. */
  recordWritten(sessionId: UUID, cellA1: string, content: string, writtenAt: string): void {
    this.database.prepare(`UPDATE teacher_blank_cells SET last_written_content = ?, last_written_at = ?
      WHERE session_id = ? AND cell_a1 = ?`).run(content, writtenAt, sessionId, cellA1);
  }

  deleteBySession(sessionId: UUID): number {
    return this.database.prepare('DELETE FROM teacher_blank_cells WHERE session_id = ?').run(sessionId).changes;
  }
}
