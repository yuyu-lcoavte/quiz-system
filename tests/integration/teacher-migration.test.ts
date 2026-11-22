import { describe, expect, it } from 'vitest';
import { blank, createFoundationTestContext, ids, question, session } from '../helpers/foundation.js';

const TIME = '2026-11-22T01:00:00.000Z';

function tableNames(database: ReturnType<typeof createFoundationTestContext>['database']): string[] {
  return (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
    .map((row) => row.name);
}

function seedImportedBlank() {
  const context = createFoundationTestContext();
  context.repositories.sessions.create(session());
  context.repositories.questions.create(question());
  context.repositories.blanks.create(blank());
  context.database.prepare(`INSERT INTO teacher_sheet_sources (session_id, spreadsheet_id, sheet_id, sheet_title, imported_at)
    VALUES (?, 'spreadsheet-id', 0, '學習單', ?)`).run(ids.session1, TIME);
  return context;
}

describe('migration 006 teacher feature', () => {
  it('applies after 001-005 and creates the three Teacher tables', () => {
    const context = createFoundationTestContext();
    const applied = (context.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[])
      .map((row) => row.version);
    expect(applied).toEqual([
      '001-foundation.sql',
      '002-student-feature.sql',
      '003-student-draft-mutations.sql',
      '004-student-team-join-order.sql',
      '005-student-leader-online-recheck.sql',
      '006-teacher-feature.sql',
    ]);
    expect(tableNames(context.database)).toEqual(expect.arrayContaining([
      'teacher_login_sessions', 'teacher_sheet_sources', 'teacher_blank_cells',
    ]));
  });

  it('stores login sessions with an optional revocation time', () => {
    const { database } = createFoundationTestContext();
    database.prepare('INSERT INTO teacher_login_sessions (id_digest, issued_at, expires_at) VALUES (?, ?, ?)').run('d'.repeat(64), TIME, TIME);
    expect(database.prepare('SELECT revoked_at FROM teacher_login_sessions').get()).toEqual({ revoked_at: null });
    expect(() => database.prepare('INSERT INTO teacher_login_sessions (id_digest, issued_at, expires_at) VALUES (?, ?, ?)').run('d'.repeat(64), TIME, TIME))
      .toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it('requires a sheet source to reference an existing Session', () => {
    const { database } = createFoundationTestContext();
    expect(() => database.prepare(`INSERT INTO teacher_sheet_sources (session_id, spreadsheet_id, sheet_id, sheet_title, imported_at)
      VALUES (?, 'x', 0, 't', ?)`).run(ids.session1, TIME)).toThrow(/FOREIGN KEY/);
  });

  it('requires a blank cell to reference an existing Blank and sheet source', () => {
    const context = seedImportedBlank();
    const insert = context.database.prepare(`INSERT INTO teacher_blank_cells
      (blank_id, session_id, cell_a1, original_content, marker, marker_index) VALUES (?, ?, ?, ?, ?, ?)`);
    insert.run(ids.blank1, ids.session1, 'G5', '（1）', '（1）', 0);
    expect(context.database.prepare('SELECT last_written_content, last_written_at FROM teacher_blank_cells').get())
      .toEqual({ last_written_content: null, last_written_at: null });
    expect(() => insert.run(ids.blank2, ids.session1, 'G6', '', null, 0)).toThrow(/FOREIGN KEY/);
    expect(() => insert.run(ids.blank1, ids.session2, 'G7', '', null, 0)).toThrow(/FOREIGN KEY|UNIQUE|PRIMARY KEY/);
  });

  it('enforces unique (session_id, cell_a1, marker_index)', () => {
    const context = seedImportedBlank();
    context.repositories.blanks.create(blank(ids.blank2, ids.question1, 1));
    const insert = context.database.prepare(`INSERT INTO teacher_blank_cells
      (blank_id, session_id, cell_a1, original_content, marker, marker_index) VALUES (?, ?, ?, ?, ?, ?)`);
    insert.run(ids.blank1, ids.session1, 'G5', '（1）（2）', '（1）', 0);
    expect(() => insert.run(ids.blank2, ids.session1, 'G5', '（1）（2）', '（2）', 0)).toThrow(/UNIQUE/);
    insert.run(ids.blank2, ids.session1, 'G5', '（1）（2）', '（2）', 1);
    expect((context.database.prepare('SELECT COUNT(*) AS n FROM teacher_blank_cells').get() as { n: number }).n).toBe(2);
  });
});
