import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { deriveTeacherKey } from './derive-key.js';

export const TEACHER_CSRF_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 4096;

interface CsrfPayload { s: string; e: number; n: string }

export interface TeacherCsrfService {
  /** `loginSessionDigest` = id_digest of the teacher_login_sessions row. */
  issue(loginSessionDigest: string): string;
  verify(token: string | undefined, loginSessionDigest: string): boolean;
}

export function createTeacherCsrfService(options: { secret: string; now?: () => number; ttlMs?: number }): TeacherCsrfService {
  const key = deriveTeacherKey(options.secret, 'teacher-csrf');
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? TEACHER_CSRF_TTL_MS;
  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');

  return {
    issue(loginSessionDigest) {
      const payload: CsrfPayload = { s: loginSessionDigest, e: now() + ttlMs, n: randomBytes(16).toString('base64url') };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${encoded}.${sign(encoded)}`;
    },
    verify(token, loginSessionDigest) {
      if (!token || token.length > MAX_TOKEN_LENGTH) return false;
      const parts = token.split('.');
      if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;
      const expected = Buffer.from(sign(parts[0]));
      const actual = Buffer.from(parts[1]);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
      try {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<CsrfPayload>;
        return payload.s === loginSessionDigest && typeof payload.e === 'number' && payload.e > now();
      } catch {
        return false;
      }
    },
  };
}
