import type {
  Blank,
  Participant,
  Question,
  QuestionGroup,
  Round,
  Session,
  Submission,
  Team,
  UUID,
} from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../apps/server/src/persistence/repositories/index.js';
import { resolveMigrationsDirectory } from '../../apps/server/src/persistence/migrate.js';
import { createTestDatabase } from './sqlite.js';

const TIME = '2026-11-09T01:00:00.000Z';

export const ids = {
  session1: '00000000-0000-4000-8000-000000000001' as UUID,
  session2: '00000000-0000-4000-8000-000000000002' as UUID,
  group1: '00000000-0000-4000-8000-000000000010' as UUID,
  group2: '00000000-0000-4000-8000-000000000011' as UUID,
  question1: '00000000-0000-4000-8000-000000000020' as UUID,
  question2: '00000000-0000-4000-8000-000000000021' as UUID,
  question3: '00000000-0000-4000-8000-000000000022' as UUID,
  questionOtherSession: '00000000-0000-4000-8000-000000000023' as UUID,
  blank1: '00000000-0000-4000-8000-000000000030' as UUID,
  blank2: '00000000-0000-4000-8000-000000000031' as UUID,
  blankOther: '00000000-0000-4000-8000-000000000032' as UUID,
  team1: '00000000-0000-4000-8000-000000000040' as UUID,
  team2: '00000000-0000-4000-8000-000000000041' as UUID,
  teamOtherSession: '00000000-0000-4000-8000-000000000042' as UUID,
  participant1: '00000000-0000-4000-8000-000000000050' as UUID,
  round1: '00000000-0000-4000-8000-000000000060' as UUID,
  round2: '00000000-0000-4000-8000-000000000061' as UUID,
  round3: '00000000-0000-4000-8000-000000000062' as UUID,
  roundOtherSession: '00000000-0000-4000-8000-000000000063' as UUID,
  submission1: '00000000-0000-4000-8000-000000000070' as UUID,
  submission2: '00000000-0000-4000-8000-000000000071' as UUID,
  result1: '00000000-0000-4000-8000-000000000080' as UUID,
  result2: '00000000-0000-4000-8000-000000000081' as UUID,
} as const;

export function createFoundationTestContext() {
  const database = createTestDatabase();
  database.runMigrations(resolveMigrationsDirectory());
  const repositories = createFoundationRepositories(database.database);
  return { ...database, repositories };
}

export function session(id: UUID = ids.session1): Session {
  return { id, activityCode: `ACT-${id.slice(-4)}`, currentRoundId: null, stateVersion: 0, createdAt: TIME };
}

export function question(
  id: UUID = ids.question1,
  sessionId: UUID = ids.session1,
  options: Partial<Question> = {},
): Question {
  return { id, sessionId, questionGroupId: null, displayNumber: null, prompt: `Question ${id.slice(-2)}`, position: 0, ...options };
}

export function questionGroup(
  id: UUID = ids.group1,
  sessionId: UUID = ids.session1,
  options: Partial<QuestionGroup> = {},
): QuestionGroup {
  return { id, sessionId, label: `Group ${id.slice(-2)}`, position: 0, ...options };
}

export function blank(
  id: UUID = ids.blank1,
  questionId: UUID = ids.question1,
  position = 0,
): Blank {
  return { id, questionId, label: `Blank ${position + 1}`, position };
}

export function team(id: UUID = ids.team1, sessionId: UUID = ids.session1): Team {
  return { id, sessionId, name: `Team ${id.slice(-2)}`, createdAt: TIME };
}

export function participant(
  id: UUID = ids.participant1,
  teamId: UUID = ids.team1,
): Participant {
  return { id, teamId, displayName: 'Learner', createdAt: TIME };
}

export function round(
  id: UUID = ids.round1,
  sessionId: UUID = ids.session1,
  target: { questionId: UUID } | { questionGroupId: UUID } = { questionId: ids.question1 },
): Round {
  return { id, sessionId, phase: 'Waiting', createdAt: TIME, ...target } as Round;
}

export function submission(
  id: UUID = ids.submission1,
  teamId: UUID = ids.team1,
  roundId: UUID = ids.round1,
  acceptedOrder = 1,
): Submission {
  return { id, teamId, roundId, receivedAt: TIME, acceptedOrder };
}

export { TIME };
