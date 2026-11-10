import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';

export type TeamRoundDraftStatus = 'editable' | 'locked';

export interface TeamRoundDraftRecord {
  sessionId: UUID;
  teamId: UUID;
  roundId: UUID;
  version: number;
  status: TeamRoundDraftStatus;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
}

export interface TeamRoundDraftAnswerRecord {
  teamId: UUID;
  roundId: UUID;
  blankId: UUID;
  value: string;
  revision: number;
  updatedByParticipantId: UUID;
  updatedAt: string;
}

interface DraftRow {
  session_id: string;
  team_id: string;
  round_id: string;
  version: number;
  status: TeamRoundDraftStatus;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
}

interface DraftAnswerRow {
  team_id: string;
  round_id: string;
  blank_id: string;
  value: string;
  revision: number;
  updated_by_participant_id: string;
  updated_at: string;
}

function mapDraft(row: DraftRow): TeamRoundDraftRecord {
  return {
    sessionId: row.session_id as UUID,
    teamId: row.team_id as UUID,
    roundId: row.round_id as UUID,
    version: row.version,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAt: row.locked_at,
  };
}

function mapAnswer(row: DraftAnswerRow): TeamRoundDraftAnswerRecord {
  return {
    teamId: row.team_id as UUID,
    roundId: row.round_id as UUID,
    blankId: row.blank_id as UUID,
    value: row.value,
    revision: row.revision,
    updatedByParticipantId: row.updated_by_participant_id as UUID,
    updatedAt: row.updated_at,
  };
}

/** Methods are synchronous and intentionally leave transaction ownership with the application service. */
export class TeamRoundDraftRepository {
  constructor(private readonly database: Database.Database) {}

  find(teamId: UUID, roundId: UUID): TeamRoundDraftRecord | null {
    const row = this.database.prepare('SELECT * FROM team_round_drafts WHERE team_id = ? AND round_id = ?').get(teamId, roundId) as DraftRow | undefined;
    return row ? mapDraft(row) : null;
  }

  createIfAbsent(draft: TeamRoundDraftRecord): boolean {
    const result = this.database.prepare(`INSERT INTO team_round_drafts
      (session_id, team_id, round_id, version, status, created_at, updated_at, locked_at)
      VALUES (@sessionId, @teamId, @roundId, @version, @status, @createdAt, @updatedAt, @lockedAt)
      ON CONFLICT(team_id, round_id) DO NOTHING`).run(draft);
    return result.changes === 1;
  }

  incrementVersion(teamId: UUID, roundId: UUID, updatedAt: string): number | null {
    const result = this.database.prepare(`UPDATE team_round_drafts
      SET version = version + 1, updated_at = ?
      WHERE team_id = ? AND round_id = ? AND status = 'editable'`).run(updatedAt, teamId, roundId);
    if (result.changes !== 1) return null;
    return (this.database.prepare('SELECT version FROM team_round_drafts WHERE team_id = ? AND round_id = ?').get(teamId, roundId) as { version: number }).version;
  }

  lock(teamId: UUID, roundId: UUID, lockedAt: string): boolean {
    const result = this.database.prepare(`UPDATE team_round_drafts SET status = 'locked', locked_at = ?, updated_at = ?
      WHERE team_id = ? AND round_id = ? AND status = 'editable'`).run(lockedAt, lockedAt, teamId, roundId);
    return result.changes === 1;
  }
}

export class TeamRoundDraftAnswerRepository {
  constructor(private readonly database: Database.Database) {}

  list(teamId: UUID, roundId: UUID): TeamRoundDraftAnswerRecord[] {
    const rows = this.database.prepare(`SELECT * FROM team_round_draft_answers
      WHERE team_id = ? AND round_id = ? ORDER BY blank_id`).all(teamId, roundId) as DraftAnswerRow[];
    return rows.map(mapAnswer);
  }

  find(teamId: UUID, roundId: UUID, blankId: UUID): TeamRoundDraftAnswerRecord | null {
    const row = this.database.prepare(`SELECT * FROM team_round_draft_answers
      WHERE team_id = ? AND round_id = ? AND blank_id = ?`).get(teamId, roundId, blankId) as DraftAnswerRow | undefined;
    return row ? mapAnswer(row) : null;
  }

  upsert(answer: TeamRoundDraftAnswerRecord): void {
    this.database.prepare(`INSERT INTO team_round_draft_answers
      (team_id, round_id, blank_id, value, revision, updated_by_participant_id, updated_at)
      VALUES (@teamId, @roundId, @blankId, @value, @revision, @updatedByParticipantId, @updatedAt)
      ON CONFLICT(team_id, round_id, blank_id) DO UPDATE SET
        value = excluded.value,
        revision = excluded.revision,
        updated_by_participant_id = excluded.updated_by_participant_id,
        updated_at = excluded.updated_at`).run(answer);
  }
}
