import type Database from 'better-sqlite3';
import type { Participant, Team, UUID } from '@quiz/contracts/domain';
import { validateParticipant, validateTeam } from '../../modules/sessions/domain/model-validation.js';
import { mapParticipant, mapTeam, type ParticipantRow, type TeamRow } from './row-mappers.js';

export class TeamRepository {
  constructor(private readonly database: Database.Database) {}

  create(value: Team): Team {
    validateTeam(value);
    this.database.prepare('INSERT INTO teams (id, session_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(value.id, value.sessionId, value.name, value.createdAt);
    return value;
  }

  listBySession(sessionId: UUID): Team[] {
    const rows = this.database.prepare('SELECT * FROM teams WHERE session_id = ? ORDER BY created_at, id').all(sessionId) as TeamRow[];
    return rows.map(mapTeam);
  }
}

export class ParticipantRepository {
  constructor(private readonly database: Database.Database) {}

  moveToTeam(id: UUID, teamId: UUID): void {
    this.database.prepare('UPDATE participants SET team_id = ? WHERE id = ?').run(teamId, id);
  }

  create(value: Participant): Participant {
    validateParticipant(value);
    this.database.prepare('INSERT INTO participants (id, team_id, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run(value.id, value.teamId, value.displayName ?? null, value.createdAt);
    return value;
  }

  findById(id: UUID): Participant | null {
    const row = this.database.prepare('SELECT * FROM participants WHERE id = ?').get(id) as ParticipantRow | undefined;
    return row ? mapParticipant(row) : null;
  }
}
