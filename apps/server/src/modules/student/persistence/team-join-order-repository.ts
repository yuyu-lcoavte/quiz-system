import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';

export class TeamJoinOrderRepository {
  constructor(private readonly database: Database.Database) {}

  append(teamId: UUID, participantId: UUID): void {
    this.database.prepare(`
      INSERT INTO student_team_join_order (participant_id, team_id, join_order)
      SELECT ?, ?, COALESCE(MAX(join_order), 0) + 1
      FROM student_team_join_order WHERE team_id = ?
    `).run(participantId, teamId, teamId);
  }

  remove(participantId: UUID): void {
    this.database.prepare('DELETE FROM student_team_join_order WHERE participant_id = ?').run(participantId);
  }

  listParticipants(teamId: UUID): UUID[] {
    const rows = this.database.prepare('SELECT p.id AS participant_id FROM participants p LEFT JOIN student_team_join_order j ON j.team_id = p.team_id AND j.participant_id = p.id WHERE p.team_id = ? ORDER BY j.join_order IS NULL, j.join_order, p.created_at, p.id')
      .all(teamId) as { participant_id: UUID }[];
    return rows.map(row => row.participant_id);
  }
}
