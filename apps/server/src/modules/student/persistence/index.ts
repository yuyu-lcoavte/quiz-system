import type Database from 'better-sqlite3';
import { StudentBrowserParticipantRepository, StudentCredentialRepository } from './identity-repository.js';
import { TeamLeaderRepository } from './team-leader-repository.js';
import { TeamRoundDraftAnswerRepository, TeamRoundDraftRepository } from './draft-repository.js';

/** Construct Student-owned persistence adapters over Foundation's existing Database instance. */
export function createStudentRepositories(database: Database.Database) {
  return {
    credentials: new StudentCredentialRepository(database),
    browserParticipants: new StudentBrowserParticipantRepository(database),
    teamLeaders: new TeamLeaderRepository(database),
    drafts: new TeamRoundDraftRepository(database),
    draftAnswers: new TeamRoundDraftAnswerRepository(database),
  };
}

export * from './identity-repository.js';
export * from './team-leader-repository.js';
export * from './draft-repository.js';
