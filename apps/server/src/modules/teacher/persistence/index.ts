import type Database from 'better-sqlite3';
import { TeacherBlankCellRepository } from './blank-cell-repository.js';
import { TeacherLoginSessionRepository } from './login-session-repository.js';
import { TeacherSheetSourceRepository } from './sheet-source-repository.js';

export * from './blank-cell-repository.js';
export * from './login-session-repository.js';
export * from './sheet-source-repository.js';

export function createTeacherRepositories(database: Database.Database) {
  return {
    loginSessions: new TeacherLoginSessionRepository(database),
    sheetSources: new TeacherSheetSourceRepository(database),
    blankCells: new TeacherBlankCellRepository(database),
  };
}

export type TeacherRepositories = ReturnType<typeof createTeacherRepositories>;
