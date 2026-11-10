import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';

export type StudentLeaderAssignmentSource = 'participant' | 'teacher' | 'system';

export interface StudentBrowserCredential {
  id: UUID;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
}

export interface StudentBrowserParticipant {
  credentialId: UUID;
  sessionId: UUID;
  participantId: UUID;
  teamId: UUID;
  createdAt: string;
}

interface CredentialRow {
  id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string;
}

interface BrowserParticipantRow {
  credential_id: string;
  session_id: string;
  participant_id: string;
  team_id: string;
  created_at: string;
}

function mapCredential(row: CredentialRow): StudentBrowserCredential {
  return {
    id: row.id as UUID,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastSeenAt: row.last_seen_at,
  };
}

function mapBrowserParticipant(row: BrowserParticipantRow): StudentBrowserParticipant {
  return {
    credentialId: row.credential_id as UUID,
    sessionId: row.session_id as UUID,
    participantId: row.participant_id as UUID,
    teamId: row.team_id as UUID,
    createdAt: row.created_at,
  };
}

/** Synchronous repository methods use the caller's shared connection and transaction. */
export class StudentCredentialRepository {
  constructor(private readonly database: Database.Database) {}

  create(credential: StudentBrowserCredential): void {
    this.database.prepare(`INSERT INTO student_browser_credentials
      (id, token_hash, created_at, expires_at, revoked_at, last_seen_at)
      VALUES (@id, @tokenHash, @createdAt, @expiresAt, @revokedAt, @lastSeenAt)`).run(credential);
  }

  findByTokenHash(tokenHash: string): StudentBrowserCredential | null {
    const row = this.database.prepare('SELECT * FROM student_browser_credentials WHERE token_hash = ?').get(tokenHash) as CredentialRow | undefined;
    return row ? mapCredential(row) : null;
  }

  findById(id: UUID): StudentBrowserCredential | null {
    const row = this.database.prepare('SELECT * FROM student_browser_credentials WHERE id = ?').get(id) as CredentialRow | undefined;
    return row ? mapCredential(row) : null;
  }

  touchLastSeenIfOlder(id: UUID, threshold: string, now: string): boolean {
    const result = this.database.prepare(`UPDATE student_browser_credentials SET last_seen_at = ?
      WHERE id = ? AND last_seen_at <= ? AND revoked_at IS NULL`).run(now, id, threshold);
    return result.changes === 1;
  }

  revoke(id: UUID, revokedAt: string): boolean {
    const result = this.database.prepare(`UPDATE student_browser_credentials SET revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL`).run(revokedAt, id);
    return result.changes === 1;
  }
}

export class StudentBrowserParticipantRepository {
  constructor(private readonly database: Database.Database) {}

  create(mapping: Omit<StudentBrowserParticipant, 'teamId'>): void {
    this.database.prepare(`INSERT INTO student_browser_participants
      (credential_id, session_id, participant_id, created_at)
      VALUES (@credentialId, @sessionId, @participantId, @createdAt)`).run(mapping);
  }

  findForSession(credentialId: UUID, sessionId: UUID): StudentBrowserParticipant | null {
    const row = this.database.prepare(`SELECT sbp.credential_id, sbp.session_id, sbp.participant_id,
        p.team_id, sbp.created_at
      FROM student_browser_participants sbp
      JOIN participants p ON p.id = sbp.participant_id
      JOIN teams t ON t.id = p.team_id AND t.session_id = sbp.session_id
      WHERE sbp.credential_id = ? AND sbp.session_id = ?`).get(credentialId, sessionId) as BrowserParticipantRow | undefined;
    return row ? mapBrowserParticipant(row) : null;
  }

  findByParticipant(sessionId: UUID, participantId: UUID): StudentBrowserParticipant | null {
    const row = this.database.prepare(`SELECT sbp.credential_id, sbp.session_id, sbp.participant_id,
        p.team_id, sbp.created_at
      FROM student_browser_participants sbp
      JOIN participants p ON p.id = sbp.participant_id
      JOIN teams t ON t.id = p.team_id AND t.session_id = sbp.session_id
      WHERE sbp.session_id = ? AND sbp.participant_id = ?`).get(sessionId, participantId) as BrowserParticipantRow | undefined;
    return row ? mapBrowserParticipant(row) : null;
  }
}
