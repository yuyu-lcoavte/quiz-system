import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TeacherLoginSessionRepository } from '../persistence/login-session-repository.js';
import { deriveTeacherKey } from './derive-key.js';

export const TEACHER_SESSION_COOKIE = 'teacher_session';
export const TEACHER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface VerifiedTeacherLogin {
  /** id_digest of the login row; also the CSRF binding. */
  readonly idDigest: string;
  readonly expiresAt: string;
}

/**
 * Cookie value `<id>.<HMAC(id)>`; the server keeps only SHA-256(id), so logout and expiry are enforced server-side
 * even if a cookie value was copied (research.md R3).
 */
export class TeacherLoginSessionService {
  private readonly key: Buffer;

  constructor(
    private readonly repository: TeacherLoginSessionRepository,
    secret: string,
    private readonly now: () => Date,
  ) {
    this.key = deriveTeacherKey(secret, 'teacher-session-cookie');
  }

  create(): { cookieValue: string; login: VerifiedTeacherLogin } {
    const issued = this.now();
    this.repository.deleteExpired(issued.toISOString());
    const id = randomBytes(32).toString('base64url');
    const login = { idDigest: digest(id), expiresAt: new Date(issued.getTime() + TEACHER_SESSION_TTL_MS).toISOString() };
    this.repository.create({ idDigest: login.idDigest, issuedAt: issued.toISOString(), expiresAt: login.expiresAt });
    return { cookieValue: `${id}.${this.sign(id)}`, login };
  }

  verify(cookieValue: string | undefined): VerifiedTeacherLogin | null {
    if (!cookieValue || cookieValue.length > 512) return null;
    const parts = cookieValue.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const expected = Buffer.from(this.sign(parts[0]));
    const actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const row = this.repository.findValid(digest(parts[0]), this.now().toISOString());
    return row ? { idDigest: row.idDigest, expiresAt: row.expiresAt } : null;
  }

  revoke(login: VerifiedTeacherLogin): void {
    this.repository.revoke(login.idDigest, this.now().toISOString());
  }

  private sign(id: string): string {
    return createHmac('sha256', this.key).update(id).digest('base64url');
  }
}

function digest(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}
