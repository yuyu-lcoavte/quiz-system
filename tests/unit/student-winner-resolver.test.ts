import { it, expect } from 'vitest';
import { StudentWinnerResolver } from '../../apps/server/src/modules/student/application/winner-resolver.js';
import { createFoundationTestContext, ids, session, question, round, team, submission } from '../helpers/foundation.js';

it('selects by persisted acceptedOrder synchronously on the injected transaction connection without writing', () => {
  const f = createFoundationTestContext(); f.repositories.sessions.create(session()); f.repositories.questions.create(question()); f.repositories.rounds.create(round());
  f.repositories.teams.create(team()); f.repositories.teams.create(team(ids.team2));
  const resolver = new StudentWinnerResolver(f.database);
  expect(f.database.transaction(() => resolver.resolveWinnerInTransaction(ids.round1)).immediate()).toBeNull();
  f.repositories.submissions.create(submission(ids.submission2, ids.team2, ids.round1, 2)); f.repositories.submissions.create(submission());
  const candidate = f.database.transaction(() => resolver.resolveWinnerInTransaction(ids.round1)).immediate();
  expect(candidate).not.toBeInstanceOf(Promise); expect(candidate?.winningSubmissionId).toBe(ids.submission1);
  expect(f.repositories.results.findByRound(ids.round1)).toBeNull();
  expect(() => resolver.resolveWinnerInTransaction(ids.round1)).toThrow(/transaction/i);
});
