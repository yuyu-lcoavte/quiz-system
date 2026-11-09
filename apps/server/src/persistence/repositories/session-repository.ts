import type Database from 'better-sqlite3';
import type { Session, UUID } from '@quiz/contracts/domain';
import { validateSession } from '../../modules/sessions/domain/model-validation.js';
import { mapSession, type SessionRow } from './row-mappers.js';

export class SessionRepository {
  constructor(private readonly database: Database.Database) {}

  create(value: Session): Session {
    validateSession(value);
    this.database.prepare(`INSERT INTO sessions (id, activity_code, current_round_id, state_version, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(value.id, value.activityCode, value.currentRoundId, value.stateVersion, value.createdAt);
    return value;
  }

  findById(id: UUID): Session | null {
    const row = this.database.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? mapSession(row) : null;
  }

  findByActivityCode(activityCode: string): Session | null {
    const row = this.database.prepare('SELECT * FROM sessions WHERE activity_code = ? COLLATE NOCASE').get(activityCode) as SessionRow | undefined;
    return row ? mapSession(row) : null;
  }
}
