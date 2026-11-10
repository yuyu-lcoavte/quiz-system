import { afterEach, describe, expect, it } from 'vitest';
import { resolveMigrationsDirectory } from '../../apps/server/src/persistence/migrate.js';
import { createTestDatabase } from '../helpers/sqlite.js';
import { ids } from '../helpers/foundation.js';

const TIME = '2026-11-10T01:00:00.000Z';
const extra = {
  credential1: '00000000-0000-4000-8000-000000000101',
  credential2: '00000000-0000-4000-8000-000000000102',
  participant2: '00000000-0000-4000-8000-000000000103',
  participantOtherSession: '00000000-0000-4000-8000-000000000104',
} as const;
const cleanup: Array<() => void> = [];

afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

function database() {
  const testDb = createTestDatabase();
  cleanup.push(testDb.cleanup);
  return testDb;
}

function seedFoundation(db: ReturnType<typeof database>['database']) {
  const session1 = ids.session1;
  const session2 = ids.session2;
  db.prepare('INSERT INTO sessions (id, activity_code, current_round_id, state_version, created_at) VALUES (?, ?, NULL, 0, ?)').run(session1, 'STUDENT-1', TIME);
  db.prepare('INSERT INTO sessions (id, activity_code, current_round_id, state_version, created_at) VALUES (?, ?, NULL, 0, ?)').run(session2, 'STUDENT-2', TIME);
  db.prepare('INSERT INTO teams (id, session_id, name, created_at) VALUES (?, ?, ?, ?)').run(ids.team1, session1, 'Team A', TIME);
  db.prepare('INSERT INTO teams (id, session_id, name, created_at) VALUES (?, ?, ?, ?)').run(ids.team2, session1, 'Team B', TIME);
  db.prepare('INSERT INTO teams (id, session_id, name, created_at) VALUES (?, ?, ?, ?)').run(ids.teamOtherSession, session2, 'Other Session Team', TIME);
  db.prepare('INSERT INTO questions (id, session_id, question_group_id, display_number, prompt, position) VALUES (?, ?, NULL, ?, ?, 0)').run(ids.question1, session1, '1', 'Question 1');
  db.prepare('INSERT INTO questions (id, session_id, question_group_id, display_number, prompt, position) VALUES (?, ?, NULL, ?, ?, 0)').run(ids.questionOtherSession, session2, '1', 'Other Session Question');
  db.prepare('INSERT INTO blanks (id, question_id, label, position) VALUES (?, ?, ?, 0)').run(ids.blank1, ids.question1, '(1)');
  db.prepare('INSERT INTO blanks (id, question_id, label, position) VALUES (?, ?, ?, 0)').run(ids.blankOther, ids.questionOtherSession, '(1)');
  db.prepare("INSERT INTO rounds (id, session_id, question_id, question_group_id, phase, created_at, started_at, ended_at) VALUES (?, ?, ?, NULL, 'Active', ?, ?, NULL)").run(ids.round1, session1, ids.question1, TIME, TIME);
  db.prepare("INSERT INTO rounds (id, session_id, question_id, question_group_id, phase, created_at, started_at, ended_at) VALUES (?, ?, ?, NULL, 'Active', ?, ?, NULL)").run(ids.roundOtherSession, session2, ids.questionOtherSession, TIME, TIME);
  db.prepare('INSERT INTO participants (id, team_id, display_name, created_at) VALUES (?, ?, ?, ?)').run(ids.participant1, ids.team1, 'Learner A', TIME);
  db.prepare('INSERT INTO participants (id, team_id, display_name, created_at) VALUES (?, ?, ?, ?)').run(extra.participant2, ids.team2, 'Learner B', TIME);
  db.prepare('INSERT INTO participants (id, team_id, display_name, created_at) VALUES (?, ?, ?, ?)').run(extra.participantOtherSession, ids.teamOtherSession, 'Other Learner', TIME);
}

describe('Student migration', () => {
  it('runs additively on an isolated test database without replacing Foundation tables', () => {
    const testDb = database();
    const applied = testDb.runMigrations(resolveMigrationsDirectory());
    const tableNames = (testDb.database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name);

    expect(testDb.path).toContain('quiz-foundation-test-');
    expect(testDb.path).not.toContain('data/quiz-system.sqlite');
    expect(testDb.database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(applied).toContain('001-foundation.sql');
    expect(applied).toContain('002-student-feature.sql');
    expect(tableNames).toEqual(expect.arrayContaining([
      'sessions', 'teams', 'participants', 'submissions', 'submission_answers', 'results',
      'student_browser_credentials', 'student_browser_participants', 'team_leaders',
      'team_round_drafts', 'team_round_draft_answers',
    ]));
  });

  it('stores only a unique credential digest and enforces Session-scoped Participant mapping', () => {
    const testDb = database();
    testDb.runMigrations(resolveMigrationsDirectory());
    const db = testDb.database;
    seedFoundation(db);
    db.prepare('INSERT INTO student_browser_credentials (id, token_hash, created_at, expires_at, revoked_at, last_seen_at) VALUES (?, ?, ?, ?, NULL, ?)')
      .run(extra.credential1, 'a'.repeat(64), TIME, '2026-11-11T01:00:00.000Z', TIME);
    db.prepare('INSERT INTO student_browser_participants (credential_id, session_id, participant_id, created_at) VALUES (?, ?, ?, ?)')
      .run(extra.credential1, ids.session1, ids.participant1, TIME);

    expect(() => db.prepare('INSERT INTO student_browser_credentials (id, token_hash, created_at, expires_at, revoked_at, last_seen_at) VALUES (?, ?, ?, ?, NULL, ?)')
      .run(extra.credential2, 'a'.repeat(64), TIME, '2026-11-11T01:00:00.000Z', TIME)).toThrow();
    expect(() => db.prepare('INSERT INTO student_browser_participants (credential_id, session_id, participant_id, created_at) VALUES (?, ?, ?, ?)')
      .run(extra.credential1, ids.session2, ids.participant1, TIME)).toThrow();
    expect(() => db.prepare('INSERT INTO student_browser_participants (credential_id, session_id, participant_id, created_at) VALUES (?, ?, ?, ?)')
      .run(extra.credential2, ids.session1, ids.participant1, TIME)).toThrow();
    expect(db.prepare('SELECT token_hash FROM student_browser_credentials WHERE id = ?').get(extra.credential1)).toEqual({ token_hash: 'a'.repeat(64) });
    expect(db.prepare('PRAGMA table_info(student_browser_credentials)').all()).not.toContainEqual(expect.objectContaining({ name: 'token' }));
  });

  it('permits at most one Team leader and requires that leader to belong to the Team', () => {
    const testDb = database();
    testDb.runMigrations(resolveMigrationsDirectory());
    const db = testDb.database;
    seedFoundation(db);

    db.prepare("INSERT INTO team_leaders (team_id, participant_id, assigned_at, assigned_by_kind, assigned_by_id) VALUES (?, ?, ?, 'system', NULL)")
      .run(ids.team1, ids.participant1, TIME);
    expect(() => db.prepare("INSERT INTO team_leaders (team_id, participant_id, assigned_at, assigned_by_kind, assigned_by_id) VALUES (?, ?, ?, 'system', NULL)")
      .run(ids.team1, extra.participant2, TIME)).toThrow();
    expect(() => db.prepare("INSERT INTO team_leaders (team_id, participant_id, assigned_at, assigned_by_kind, assigned_by_id) VALUES (?, ?, ?, 'teacher', 'teacher-1')")
      .run(ids.team1, extra.participantOtherSession, TIME)).toThrow();
  });

  it('persists a Team/Round draft with only target Blanks and prevents mutation after locking', () => {
    const testDb = database();
    testDb.runMigrations(resolveMigrationsDirectory());
    const db = testDb.database;
    seedFoundation(db);
    db.prepare("INSERT INTO team_round_drafts (session_id, team_id, round_id, version, status, created_at, updated_at, locked_at) VALUES (?, ?, ?, 0, 'editable', ?, ?, NULL)")
      .run(ids.session1, ids.team1, ids.round1, TIME, TIME);
    db.prepare('INSERT INTO team_round_draft_answers (team_id, round_id, blank_id, value, revision, updated_by_participant_id, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .run(ids.team1, ids.round1, ids.blank1, 'draft answer', ids.participant1, TIME);

    expect(db.prepare('SELECT value, revision FROM team_round_draft_answers WHERE team_id = ? AND round_id = ? AND blank_id = ?')
      .get(ids.team1, ids.round1, ids.blank1)).toEqual({ value: 'draft answer', revision: 1 });
    expect(() => db.prepare("INSERT INTO team_round_drafts (session_id, team_id, round_id, version, status, created_at, updated_at, locked_at) VALUES (?, ?, ?, 0, 'editable', ?, ?, NULL)")
      .run(ids.session2, ids.team1, ids.round1, TIME, TIME)).toThrow();
    expect(() => db.prepare('INSERT INTO team_round_draft_answers (team_id, round_id, blank_id, value, revision, updated_by_participant_id, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .run(ids.team1, ids.round1, ids.blankOther, 'wrong target', ids.participant1, TIME)).toThrow();
    expect(() => db.prepare("UPDATE team_round_drafts SET status = 'locked', locked_at = ? WHERE team_id = ? AND round_id = ?")
      .run(TIME, ids.team1, ids.round1)).not.toThrow();
    expect(() => db.prepare("UPDATE team_round_drafts SET status = 'editable', locked_at = NULL WHERE team_id = ? AND round_id = ?")
      .run(ids.team1, ids.round1)).toThrow();
    expect(() => db.prepare('UPDATE team_round_draft_answers SET value = ? WHERE team_id = ? AND round_id = ? AND blank_id = ?')
      .run('changed', ids.team1, ids.round1, ids.blank1)).toThrow();
    expect(() => db.prepare('DELETE FROM team_round_draft_answers WHERE team_id = ? AND round_id = ? AND blank_id = ?')
      .run(ids.team1, ids.round1, ids.blank1)).toThrow();
  });
});
