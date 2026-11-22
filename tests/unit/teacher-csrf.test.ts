import { describe, expect, it } from 'vitest';
import { createTeacherCsrfService } from '../../apps/server/src/modules/teacher/auth/teacher-csrf.js';

const secret = 'teacher-test-session-secret-0123456789';
const session = 'a'.repeat(64);

describe('Teacher CSRF tokens', () => {
  it('verifies a token for the login session it was issued to', () => {
    const csrf = createTeacherCsrfService({ secret });
    expect(csrf.verify(csrf.issue(session), session)).toBe(true);
  });

  it('rejects a token for another login session', () => {
    const csrf = createTeacherCsrfService({ secret });
    expect(csrf.verify(csrf.issue(session), 'b'.repeat(64))).toBe(false);
  });

  it('rejects tampered, malformed, missing and oversized tokens', () => {
    const csrf = createTeacherCsrfService({ secret });
    const token = csrf.issue(session);
    const [payload, signature] = token.split('.');
    expect(csrf.verify(`${payload}.${signature.slice(0, -2)}AA`, session)).toBe(false);
    expect(csrf.verify(`${payload}x.${signature}`, session)).toBe(false);
    expect(csrf.verify('not-a-token', session)).toBe(false);
    expect(csrf.verify(undefined, session)).toBe(false);
    expect(csrf.verify('a'.repeat(4097), session)).toBe(false);
  });

  it('rejects a token signed with another secret', () => {
    const other = createTeacherCsrfService({ secret: 'another-teacher-secret-0123456789abcd' });
    expect(createTeacherCsrfService({ secret }).verify(other.issue(session), session)).toBe(false);
  });

  it('expires after 8 hours', () => {
    let now = Date.parse('2026-11-22T01:00:00.000Z');
    const csrf = createTeacherCsrfService({ secret, now: () => now });
    const token = csrf.issue(session);
    now += 8 * 60 * 60 * 1000 - 1;
    expect(csrf.verify(token, session)).toBe(true);
    now += 1;
    expect(csrf.verify(token, session)).toBe(false);
  });
});
