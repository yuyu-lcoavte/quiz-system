import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import type { StudentLeaderAssignmentSource } from './identity-repository.js';

export interface TeamLeaderRecord {
  teamId: UUID;
  participantId: UUID;
  assignedAt: string;
  assignedByKind: StudentLeaderAssignmentSource;
  assignedById: string | null;
}

interface TeamLeaderRow {
  team_id: string;
  participant_id: string;
  assigned_at: string;
  assigned_by_kind: StudentLeaderAssignmentSource;
  assigned_by_id: string | null;
}

function mapLeader(row: TeamLeaderRow): TeamLeaderRecord {
  return {
    teamId: row.team_id as UUID,
    participantId: row.participant_id as UUID,
    assignedAt: row.assigned_at,
    assignedByKind: row.assigned_by_kind,
    assignedById: row.assigned_by_id,
  };
}

/** Persistence only; election and transfer policy belong to Student application services. */
export class TeamLeaderRepository {
  constructor(private readonly database: Database.Database) {}

  findByTeamId(teamId: UUID): TeamLeaderRecord | null {
    const row = this.database.prepare('SELECT * FROM team_leaders WHERE team_id = ?').get(teamId) as TeamLeaderRow | undefined;
    return row ? mapLeader(row) : null;
  }

  createIfAbsent(leader: TeamLeaderRecord): boolean {
    const result = this.database.prepare(`INSERT INTO team_leaders
      (team_id, participant_id, assigned_at, assigned_by_kind, assigned_by_id)
      VALUES (@teamId, @participantId, @assignedAt, @assignedByKind, @assignedById)
      ON CONFLICT(team_id) DO NOTHING`).run(leader);
    return result.changes === 1;
  }

  replaceIfCurrent(teamId: UUID, currentParticipantId: UUID, next: Omit<TeamLeaderRecord, 'teamId'>): boolean {
    const result = this.database.prepare(`UPDATE team_leaders SET participant_id = @participantId,
      assigned_at = @assignedAt, assigned_by_kind = @assignedByKind, assigned_by_id = @assignedById
      WHERE team_id = @teamId AND participant_id = @currentParticipantId`).run({ ...next, teamId, currentParticipantId });
    return result.changes === 1;
  }
}
