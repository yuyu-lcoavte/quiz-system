import type Database from 'better-sqlite3';

export interface TeacherLoginSessionRecord {
  readonly idDigest: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

interface LoginSessionRow { id_digest: string; issued_at: string; expires_at: string }

/** Server-side record of each Teacher login (one per device). Only the digest of the session id is stored. */
export class TeacherLoginSessionRepository {
  constructor(private readonly database: Database.Database) {}

  create(record: TeacherLoginSessionRecord): void {
    this.database.prepare('INSERT INTO teacher_login_sessions (id_digest, issued_at, expires_at) VALUES (?, ?, ?)')
      .run(record.idDigest, record.issuedAt, record.expiresAt);
  }

  /** Valid = not revoked and `now` strictly before `expires_at` (ISO-8601 UTC strings compare in time order). */
  findValid(idDigest: string, now: string): TeacherLoginSessionRecord | null {
    const row = this.database.prepare(`SELECT id_digest, issued_at, expires_at FROM teacher_login_sessions
      WHERE id_digest = ? AND revoked_at IS NULL AND expires_at > ?`).get(idDigest, now) as LoginSessionRow | undefined;
    return row ? { idDigest: row.id_digest, issuedAt: row.issued_at, expiresAt: row.expires_at } : null;
  }

  revoke(idDigest: string, revokedAt: string): void {
    this.database.prepare('UPDATE teacher_login_sessions SET revoked_at = ? WHERE id_digest = ? AND revoked_at IS NULL')
      .run(revokedAt, idDigest);
  }

  deleteExpired(now: string): number {
    return this.database.prepare('DELETE FROM teacher_login_sessions WHERE expires_at <= ?').run(now).changes;
  }
}
