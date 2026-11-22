import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';

export interface TeacherSheetSource {
  readonly sessionId: UUID;
  readonly spreadsheetId: string;
  readonly sheetId: number;
  readonly sheetTitle: string;
  readonly importedAt: string;
}

interface SheetSourceRow { session_id: string; spreadsheet_id: string; sheet_id: number; sheet_title: string; imported_at: string }

/** The Google Sheets tab a Session's questions were imported from (one per Session). */
export class TeacherSheetSourceRepository {
  constructor(private readonly database: Database.Database) {}

  replace(source: TeacherSheetSource): void {
    this.database.prepare(`INSERT INTO teacher_sheet_sources (session_id, spreadsheet_id, sheet_id, sheet_title, imported_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (session_id) DO UPDATE SET spreadsheet_id = excluded.spreadsheet_id, sheet_id = excluded.sheet_id,
        sheet_title = excluded.sheet_title, imported_at = excluded.imported_at`)
      .run(source.sessionId, source.spreadsheetId, source.sheetId, source.sheetTitle, source.importedAt);
  }

  find(sessionId: UUID): TeacherSheetSource | null {
    const row = this.database.prepare('SELECT * FROM teacher_sheet_sources WHERE session_id = ?').get(sessionId) as SheetSourceRow | undefined;
    return row ? {
      sessionId: row.session_id as UUID,
      spreadsheetId: row.spreadsheet_id,
      sheetId: row.sheet_id,
      sheetTitle: row.sheet_title,
      importedAt: row.imported_at,
    } : null;
  }

  delete(sessionId: UUID): void {
    this.database.prepare('DELETE FROM teacher_sheet_sources WHERE session_id = ?').run(sessionId);
  }
}
