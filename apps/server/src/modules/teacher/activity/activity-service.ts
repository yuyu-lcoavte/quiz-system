import { randomInt, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import type { ActivitySummary, TeacherSessionView } from '@quiz/contracts';
import { HttpError } from '../../../errors/http-error.js';
import { SessionStateService } from '../../sessions/application/session-state-service.js';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import type { TeacherRepositories } from '../persistence/index.js';
import { TargetCatalog, toTargetStatusView } from '../rounds/target-catalog.js';

/** No 0/O/1/I/L so the code is easy to read aloud and type (research.md R7). */
export const ACTIVITY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACTIVITY_CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 10;

export function generateActivityCode(): string {
  let code = '';
  for (let i = 0; i < ACTIVITY_CODE_LENGTH; i += 1) code += ACTIVITY_CODE_ALPHABET[randomInt(ACTIVITY_CODE_ALPHABET.length)];
  return code;
}

export function teamName(index: number): string {
  return `第${index}組`;
}

export class ActivityService {
  private readonly repositories;
  private readonly state: SessionStateService;
  private readonly catalog: TargetCatalog;

  constructor(
    private readonly database: Database.Database,
    private readonly teacher: TeacherRepositories,
    private readonly now: () => Date,
    private readonly codeGenerator: () => string = generateActivityCode,
  ) {
    this.repositories = createFoundationRepositories(database);
    this.state = new SessionStateService(database);
    this.catalog = new TargetCatalog(database);
  }

  /** Session + Teams 第1組…第N組 in one immediate transaction; retries on activity-code collision. */
  create(teamCount: number): ActivitySummary {
    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const sessionId = randomUUID() as UUID;
      const created = this.now();
      const activityCode = this.codeGenerator();
      try {
        this.database.transaction(() => {
          this.repositories.sessions.create({ id: sessionId, activityCode, currentRoundId: null, stateVersion: 0, createdAt: created.toISOString() });
          for (let index = 1; index <= teamCount; index += 1) {
            // Distinct timestamps keep 第1組…第N組 in order wherever Teams are listed by created_at.
            this.repositories.teams.create({
              id: randomUUID() as UUID, sessionId, name: teamName(index),
              createdAt: new Date(created.getTime() + index).toISOString(),
            });
          }
        }).immediate();
        return this.summary(sessionId)!;
      } catch (error) {
        const isCodeCollision = (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
          && String((error as Error).message).includes('activity_code');
        if (!isCodeCollision || attempt === MAX_CODE_ATTEMPTS) throw error;
      }
    }
    throw new HttpError(500, 'INTERNAL_ERROR', 'Could not allocate an activity code.');
  }

  list(): ActivitySummary[] {
    const rows = this.database.prepare('SELECT id FROM sessions ORDER BY created_at DESC, rowid DESC').all() as { id: string }[];
    return rows.map((row) => this.summary(row.id as UUID)!);
  }

  detail(sessionId: UUID): TeacherSessionView {
    const session = this.repositories.sessions.findById(sessionId);
    const state = this.state.getSnapshot(sessionId);
    if (!session || !state) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    const source = this.teacher.sheetSources.find(sessionId);
    return {
      sessionId,
      activityCode: session.activityCode,
      state,
      teams: this.repositories.teams.listBySession(sessionId).map((team) => ({ teamId: team.id, name: team.name })),
      targets: this.catalog.targets(sessionId).map(toTargetStatusView),
      source: source ? {
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/edit#gid=${source.sheetId}`,
        sheetTitle: source.sheetTitle,
        importedAt: source.importedAt,
      } : null,
    };
  }

  private summary(sessionId: UUID): ActivitySummary | null {
    const session = this.repositories.sessions.findById(sessionId);
    const state = this.state.getSnapshot(sessionId);
    if (!session || !state) return null;
    return {
      sessionId,
      activityCode: session.activityCode,
      createdAt: session.createdAt,
      teamCount: this.repositories.teams.listBySession(sessionId).length,
      phase: state.phase,
      imported: this.teacher.sheetSources.find(sessionId) !== null,
    };
  }
}
