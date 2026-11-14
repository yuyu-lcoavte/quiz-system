import { expect, it, vi } from 'vitest';
import request from 'supertest';
import type { ActorContext } from '@quiz/contracts/identity';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { endRoundWithResult } from '../../apps/server/src/modules/sessions/application/foundation-transactions.js';
import { SessionLifecycleService } from '../../apps/server/src/modules/sessions/application/session-lifecycle-service.js';
import { SessionStateService } from '../../apps/server/src/modules/sessions/application/session-state-service.js';
import { StudentTrustedEndCoordinator, type FoundationLifecycleEndPort } from '../../apps/server/src/modules/student/application/student-trusted-end-coordinator.js';
import { StudentWinnerResolver } from '../../apps/server/src/modules/student/application/winner-resolver.js';
import { SubmissionService } from '../../apps/server/src/modules/student/application/submission-service.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { draftFixture } from '../helpers/student-draft.js';
import { ids, round, submission, TIME } from '../helpers/foundation.js';
import { cookieOf } from '../helpers/student.js';

const teacher: ActorContext = { actorKind: 'teacher', actorId: 'test-teacher', sessionId: ids.session1, permissions: ['round:end'] };
const input = { sessionId: ids.session1, roundId: ids.round1, expectedStateVersion: 0, requestId: 'test-end' };
const origin = 'http://127.0.0.1:5173';
const answers = [{ blankId: ids.blank1, value: 'one' }, { blankId: ids.blank2, value: 'two' }];

async function setup() {
  const fixture = await draftFixture();
  const { database } = fixture;
  const publish = vi.fn();
  const resolver = new StudentWinnerResolver(database);
  // Contract test double. Production Foundation still lacks the callback port.
  // The existing persistence primitive runs as a savepoint of this outer transaction.
  const port: FoundationLifecycleEndPort = {
    endRoundWithWinnerResolver(command, resolveWinner) {
      const snapshot = database.transaction(() => {
        const state = new SessionStateService(database).getSnapshot(command.sessionId);
        if (state?.currentRoundId !== command.roundId || state.stateVersion !== command.expectedStateVersion || state.phase !== 'Active') {
          throw new Error('Invalid End scope in test port');
        }
        const candidate = resolveWinner(command.roundId);
        endRoundWithResult(database, { roundId: command.roundId, expectedStateVersion: command.expectedStateVersion, endedAt: TIME, result: candidate ?? undefined });
        return new SessionStateService(database).getSnapshot(command.sessionId)!;
      }).immediate();
      publish(snapshot);
      return snapshot;
    },
  };
  const coordinator = new StudentTrustedEndCoordinator(port, resolver);
  const submit = () => request(fixture.app).post(`${fixture.base}/rounds/${ids.round1}/submissions`)
    .set('Origin', origin).set('Cookie', cookieOf(fixture.a)).set('X-CSRF-Token', fixture.a.body.data.csrfToken).send({ answers });
  const result = (roundId = ids.round1) => request(fixture.app).get(`${fixture.base}/rounds/${roundId}/result`).set('Cookie', cookieOf(fixture.a));
  for (const answer of answers) expect((await fixture.edit(answer.value, answer.blankId)).status).toBe(200);
  return { ...fixture, publish, resolver, port, coordinator, submit, result };
}

it('checks the trusted Teacher scope and delegates once with a deferred resolver', async () => {
  const f = await setup();
  const invoke = vi.spyOn(f.port, 'endRoundWithWinnerResolver');
  const resolve = vi.spyOn(f.resolver, 'resolveWinnerInTransaction');
  for (const actor of [null, { ...teacher, actorKind: 'participant' } as const]) {
    expect(() => f.coordinator.endRound(input, actor)).toThrow(expect.objectContaining({ status: 401 }));
  }
  for (const actor of [{ ...teacher, permissions: [] }, { ...teacher, sessionId: ids.session2 }]) {
    expect(() => f.coordinator.endRound(input, actor)).toThrow(expect.objectContaining({ status: 403 }));
  }
  expect(invoke).not.toHaveBeenCalled();
  expect(resolve).not.toHaveBeenCalled();
  expect(f.coordinator.endRound(input, teacher)).toMatchObject({ phase: 'Ended', stateVersion: 1 });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(resolve).toHaveBeenCalledExactlyOnceWith(ids.round1);
});

it('projects the submission that committed first and publishes only once the Result is visible', async () => {
  const f = await setup();
  const accepted = await f.submit();
  expect(accepted.status).toBe(200);
  expect((await f.result()).status).toBe(403);
  const observer = new DatabaseManager({ sqlitePath: f.database.name });
  try {
    const read = observer.open().prepare('SELECT phase, winning_submission_id FROM rounds JOIN results ON results.round_id = rounds.id WHERE rounds.id = ?');
    f.publish.mockImplementation(() => {
      expect(f.database.inTransaction).toBe(false);
      expect(read.get(ids.round1)).toEqual({ phase: 'Ended', winning_submission_id: accepted.body.data.submissionId });
    });
    f.coordinator.endRound(input, teacher);
    expect(f.publish).toHaveBeenCalledTimes(1);
  } finally {
    observer.close();
  }
  expect((await f.result()).body.data.winner).toMatchObject({ teamId: ids.team1, answers });
  expect((await f.edit('late')).body.error.code).toBe('INVALID_PHASE');
  expect((await f.submit()).body.error.code).toBe('INVALID_PHASE');

  const lifecycle = new SessionLifecycleService(f.database);
  const waiting = lifecycle.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 1);
  const active = lifecycle.startRound(ids.session1, waiting.stateVersion);
  expect(active.currentRoundId).not.toBe(ids.round1);
  const draft = await request(f.app).get(`${f.base}/rounds/${active.currentRoundId}/draft`).set('Cookie', cookieOf(f.a));
  expect(draft.body.data).toMatchObject({ version: 0, status: 'editable', answers: [] });
  expect((await f.result()).status).toBe(403);
});

it.each(['submit', 'end'] as const)('serializes competing writers when %s takes the lock first', async first => {
  const f = await setup();
  const other = new DatabaseManager({ sqlitePath: f.database.name, timeoutMs: 0 });
  try {
    const connection = other.open();
    const identity = new StudentIdentityService(createStudentRepositories(connection));
    const actor = identity.resolve(cookieOf(f.a), ids.session1)!.actorContext;
    const submit = () => new SubmissionService(connection).submit(actor, ids.session1, ids.round1, answers);
    if (first === 'submit') {
      f.database.pragma('busy_timeout = 0');
      connection.function('try_test_end', () => {
        expect(() => f.coordinator.endRound(input, teacher)).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
        return 0;
      });
      connection.exec('CREATE TEMP TRIGGER test_competing_end BEFORE INSERT ON submissions BEGIN SELECT try_test_end(); END');
      const accepted = submit();
      expect(f.publish).not.toHaveBeenCalled();
      f.coordinator.endRound(input, teacher);
      expect(f.repositories.results.findByRound(ids.round1)?.winningSubmissionId).toBe(accepted.submissionId);
    } else {
      const resolve = f.resolver.resolveWinnerInTransaction.bind(f.resolver);
      vi.spyOn(f.resolver, 'resolveWinnerInTransaction').mockImplementationOnce(roundId => {
        expect(() => submit()).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
        return resolve(roundId);
      });
      f.coordinator.endRound(input, teacher);
      expect(() => submit()).toThrow(expect.objectContaining({ code: 'INVALID_PHASE' }));
      expect(f.repositories.results.findByRound(ids.round1)).toBeNull();
    }
    expect(f.publish).toHaveBeenCalledTimes(1);
  } finally {
    other.close();
  }
});

it.each([false, true])('End first rejects a later submission and projects the current result (new winner: %s)', async hasWinner => {
  const f = await setup();
  f.repositories.rounds.create({ ...round(ids.round2), phase: 'Ended', startedAt: TIME, endedAt: TIME });
  f.repositories.submissions.create(submission(ids.submission2, ids.team2, ids.round2, 1));
  f.repositories.results.create({ id: ids.result2, roundId: ids.round2, winningSubmissionId: ids.submission2, createdAt: TIME });
  if (hasWinner) expect((await f.submit()).status).toBe(200);

  f.coordinator.endRound(input, teacher);
  expect((await f.submit()).body.error.code).toBe('INVALID_PHASE');
  expect((await f.edit('late')).body.error.code).toBe('INVALID_PHASE');
  expect(f.repositories.results.findByRound(ids.round2)).toBeNull();
  expect((await f.result(ids.round2)).status).toBe(403);
  const projected = (await f.result()).body.data;
  if (hasWinner) expect(projected.winner).toMatchObject({ teamId: ids.team1, answers });
  else expect(projected).toEqual({ roundId: ids.round1, winner: null });
  expect(f.publish).toHaveBeenCalledTimes(1);
});

it.each(['resolver', 'persistence'])('rolls back %s failure without publishing or dropping the previous Result', async failure => {
  const f = await setup();
  f.repositories.rounds.create({ ...round(ids.round2), phase: 'Ended', startedAt: TIME, endedAt: TIME });
  f.repositories.submissions.create(submission(ids.submission2, ids.team2, ids.round2, 1));
  f.repositories.results.create({ id: ids.result2, roundId: ids.round2, winningSubmissionId: ids.submission2, createdAt: TIME });
  if (failure === 'resolver') {
    vi.spyOn(f.resolver, 'resolveWinnerInTransaction').mockImplementationOnce(() => { throw new Error('test resolver failure'); });
  } else {
    expect((await f.submit()).status).toBe(200);
    f.database.exec("CREATE TRIGGER test_result_failure BEFORE INSERT ON results BEGIN SELECT RAISE(ABORT, 'test persistence failure'); END");
  }
  expect(() => f.coordinator.endRound(input, teacher)).toThrow();
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.repositories.sessions.findById(ids.session1)?.stateVersion).toBe(0);
  expect(f.repositories.rounds.findById(ids.round1)?.phase).toBe('Active');
  expect(f.repositories.results.findByRound(ids.round1)).toBeNull();
  expect(f.repositories.results.findByRound(ids.round2)?.id).toBe(ids.result2);
  if (failure === 'resolver') expect((await f.submit()).status).toBe(200);
});
