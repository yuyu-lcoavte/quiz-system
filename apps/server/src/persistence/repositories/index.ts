import type Database from 'better-sqlite3';
import { BlankRepository, QuestionGroupRepository, QuestionRepository } from './question-repositories.js';
import { ResultRepository } from './result-repository.js';
import { RoundRepository } from './round-repository.js';
import { SessionRepository } from './session-repository.js';
import { SubmissionAnswerRepository, SubmissionRepository } from './submission-repository.js';
import { ParticipantRepository, TeamRepository } from './team-repository.js';

export { BlankRepository, QuestionGroupRepository, QuestionRepository } from './question-repositories.js';
export { ResultRepository } from './result-repository.js';
export { RoundRepository } from './round-repository.js';
export { SessionRepository } from './session-repository.js';
export { SubmissionAnswerRepository, SubmissionRepository } from './submission-repository.js';
export { ParticipantRepository, TeamRepository } from './team-repository.js';

export function createFoundationRepositories(database: Database.Database) {
  const blanks = new BlankRepository(database);
  const questions = new QuestionRepository(database, blanks);
  const questionGroups = new QuestionGroupRepository(database, questions);
  return {
    sessions: new SessionRepository(database),
    rounds: new RoundRepository(database),
    questions,
    blanks,
    questionGroups,
    teams: new TeamRepository(database),
    participants: new ParticipantRepository(database),
    submissions: new SubmissionRepository(database),
    submissionAnswers: new SubmissionAnswerRepository(database),
    results: new ResultRepository(database),
  };
}
