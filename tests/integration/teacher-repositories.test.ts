import { describe, expect, it } from 'vitest';
import { createTeacherRepositories } from '../../apps/server/src/modules/teacher/persistence/index.js';
import { blank, createFoundationTestContext, ids, question, session } from '../helpers/foundation.js';

const ISSUED = '2026-11-22T01:00:00.000Z';
const EXPIRES = '2026-11-22T09:00:00.000Z';

function context() {
  const foundation = createFoundationTestContext();
  return { ...foundation, teacher: createTeacherRepositories(foundation.database) };
}

describe('Teacher repositories', () => {
  it('finds a login session only while it is unrevoked and unexpired', () => {
    const { teacher } = context();
    const digest = 'a'.repeat(64);
    teacher.loginSessions.create({ idDigest: digest, issuedAt: ISSUED, expiresAt: EXPIRES });
    expect(teacher.loginSessions.findValid(digest, '2026-11-22T08:59:59.999Z')).toEqual({ idDigest: digest, issuedAt: ISSUED, expiresAt: EXPIRES });
    expect(teacher.loginSessions.findValid(digest, EXPIRES)).toBeNull();
    teacher.loginSessions.revoke(digest, '2026-11-22T02:00:00.000Z');
    expect(teacher.loginSessions.findValid(digest, '2026-11-22T02:00:01.000Z')).toBeNull();
  });

  it('revokes only the given device session', () => {
    const { teacher } = context();
    teacher.loginSessions.create({ idDigest: 'a'.repeat(64), issuedAt: ISSUED, expiresAt: EXPIRES });
    teacher.loginSessions.create({ idDigest: 'b'.repeat(64), issuedAt: ISSUED, expiresAt: EXPIRES });
    teacher.loginSessions.revoke('a'.repeat(64), ISSUED);
    expect(teacher.loginSessions.findValid('b'.repeat(64), ISSUED)).not.toBeNull();
  });

  it('deletes expired login sessions', () => {
    const { teacher, database } = context();
    teacher.loginSessions.create({ idDigest: 'a'.repeat(64), issuedAt: ISSUED, expiresAt: EXPIRES });
    teacher.loginSessions.create({ idDigest: 'b'.repeat(64), issuedAt: ISSUED, expiresAt: '2026-11-23T09:00:00.000Z' });
    expect(teacher.loginSessions.deleteExpired('2026-11-22T10:00:00.000Z')).toBe(1);
    expect((database.prepare('SELECT COUNT(*) AS n FROM teacher_login_sessions').get() as { n: number }).n).toBe(1);
  });

  it('stores, replaces and deletes a sheet source and its blank cells', () => {
    const { teacher, repositories } = context();
    repositories.sessions.create(session());
    repositories.questions.create(question());
    repositories.blanks.create(blank());
    teacher.sheetSources.replace({ sessionId: ids.session1, spreadsheetId: 'sheet-a', sheetId: 0, sheetTitle: '學習單', importedAt: ISSUED });
    teacher.blankCells.create({ blankId: ids.blank1, sessionId: ids.session1, cellA1: 'G5', originalContent: '（1）', marker: '（1）', markerIndex: 0 });
    expect(teacher.sheetSources.find(ids.session1)).toEqual({ sessionId: ids.session1, spreadsheetId: 'sheet-a', sheetId: 0, sheetTitle: '學習單', importedAt: ISSUED });
    expect(teacher.blankCells.listBySession(ids.session1)).toEqual([{
      blankId: ids.blank1, sessionId: ids.session1, cellA1: 'G5', originalContent: '（1）', marker: '（1）', markerIndex: 0,
      lastWrittenContent: null, lastWrittenAt: null,
    }]);

    teacher.blankCells.recordWritten(ids.session1, 'G5', '（1）CPU', '2026-11-22T03:00:00.000Z');
    expect(teacher.blankCells.listBySession(ids.session1)[0]).toMatchObject({ lastWrittenContent: '（1）CPU', lastWrittenAt: '2026-11-22T03:00:00.000Z' });

    teacher.sheetSources.replace({ sessionId: ids.session1, spreadsheetId: 'sheet-b', sheetId: 7, sheetTitle: 'B', importedAt: EXPIRES });
    expect(teacher.sheetSources.find(ids.session1)?.spreadsheetId).toBe('sheet-b');

    expect(teacher.blankCells.deleteBySession(ids.session1)).toBe(1);
    teacher.sheetSources.delete(ids.session1);
    expect(teacher.sheetSources.find(ids.session1)).toBeNull();
  });
});
