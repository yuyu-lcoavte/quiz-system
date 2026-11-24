import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { RoundTargetReference, SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { StudentWinnerResolver } from '../../apps/server/src/modules/student/application/winner-resolver.js';
import { SubmissionService } from '../../apps/server/src/modules/student/application/submission-service.js';
import { StudentCredentialRepository } from '../../apps/server/src/modules/student/persistence/identity-repository.js';
import {
  createActivity,
  createTeacherTestServer,
  loginAsTeacher,
  seedQuestionGroupTargets,
  teacherApi,
  TEACHER_TEST_ORIGIN,
  STUDENT_TEST_SECRET,
  editDraft,
  submitAnswers,
  type TeacherTestServer,
} from '../helpers/teacher.js';

async function joinStudent(server: TeacherTestServer, sessionId: UUID, teamId: UUID, name: string) {
  const response = await request(server.app).post(`/api/v1/student/sessions/${sessionId}/enrollments`)
    .set('Origin', TEACHER_TEST_ORIGIN).send({ teamId, displayName: name });
  if (response.status !== 201 && response.status !== 200) throw new Error(`Join failed with ${response.status}: ${JSON.stringify(response.body)}`);
  return { cookie: String(response.headers['set-cookie'][0]).split(';')[0], csrfToken: response.body.data.csrfToken as string };
}

async function submitAnswer(server: TeacherTestServer, sessionId: UUID, roundId: UUID, blankId: UUID, student: { cookie: string; csrfToken: string }, value: string) {
  const base = `/api/v1/student/sessions/${sessionId}/rounds/${roundId}`;
  const edit = await request(server.app).put(`${base}/draft/answers/${blankId}`).set('Cookie', student.cookie)
    .set('Origin', TEACHER_TEST_ORIGIN).set('X-CSRF-Token', student.csrfToken)
    .send({ value, baseVersion: 0, clientMutationId: randomUUID() });
  if (edit.status !== 200) return edit;
  return request(server.app).post(`${base}/submissions`).set('Cookie', student.cookie)
    .set('Origin', TEACHER_TEST_ORIGIN).set('X-CSRF-Token', student.csrfToken).send({ answers: [{ blankId, value }] });
}

async function setup() {
  const server = createTeacherTestServer({ withStudents: true });
  const auth = await loginAsTeacher(server);
  const api = teacherApi(server, auth);
  const { sessionId } = await createActivity(server, auth, 2);
  const targets = seedQuestionGroupTargets(server, sessionId);
  const base = `/sessions/${sessionId}`;
  const detail = async () => (await api.get(base)).body.data;
  const version = async () => (await detail()).state.stateVersion as number;
  const teams = (await detail()).teams as { teamId: UUID; name: string }[];
  const team1 = await joinStudent(server, sessionId, teams[0].teamId, 'A');
  const team2 = await joinStudent(server, sessionId, teams[1].teamId, 'B');
  const blank3 = targets.blanks[targets.question3][0];
  const openQuestion3 = async () => {
    await api.post(`${base}/rounds/select`, { target: { kind: 'question', questionId: targets.question3 }, expectedStateVersion: await version() });
    const started = await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() });
    return started.body.data.currentRoundId as UUID;
  };
  const end = async (extra: object = {}) => api.post(`${base}/rounds/end`, { expectedStateVersion: await version(), ...extra });
  const resultTeam = () => (server.database.prepare(`SELECT s.team_id FROM results r JOIN submissions s ON s.id = r.winning_submission_id
    JOIN rounds ro ON ro.id = r.round_id WHERE ro.question_id = ?`).all(targets.question3) as { team_id: string }[]).map((row) => row.team_id);
  return { server, api, auth, base, version, targets, sessionId, teams, team1, team2, blank3, openQuestion3, end, resultTeam };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
async function openTarget(f: Fixture, sessionId: UUID, target: RoundTargetReference) {
  const base = `/sessions/${sessionId}`;
  const version = (await f.api.get(base)).body.data.state.stateVersion;
  const selected = await f.api.post(`${base}/rounds/select`, { target, expectedStateVersion: version });
  expect(selected.status).toBe(200);
  const active = await f.api.post(`${base}/rounds/start`, { expectedStateVersion: selected.body.data.stateVersion });
  expect(active.status).toBe(200);
  return active.body.data as SessionStateSnapshot;
}

function submitPersisted(f: Fixture, roundId: UUID, url?: string) {
  return request(url ?? f.server.app).post(`/api/v1/student/sessions/${f.sessionId}/rounds/${roundId}/submissions`)
    .set('Cookie', f.team1.cookie).set('Origin', TEACHER_TEST_ORIGIN).set('X-CSRF-Token', f.team1.csrfToken)
    .send({ answers: [{ blankId: f.blank3, value: 'race answer' }] });
}

function raceWorker(f: Fixture, roundId: UUID, first: 'submit' | 'end') {
  const barrier = new SharedArrayBuffer(4);
  // Keep ESM import conditions for the real @quiz/contracts exports inside the test worker.
  const worker = new Worker("const { entry } = require('node:worker_threads').workerData; import('tsx/esm/api').then(({ tsImport }) => tsImport(entry, entry)).catch(error => { throw error; });", {
    eval: true,
    workerData: { entry: pathToFileURL(resolve('tests/helpers/teacher-end-race-worker.ts')).href, databasePath: f.server.database.name,
      config: f.server.config, studentSecret: STUDENT_TEST_SECRET, roundId, first, barrier },
  });
  function message<T>(type: string): Promise<T> {
    return new Promise((accept, reject) => {
      const cleanup = () => { clearTimeout(timer); worker.off('message', receive); worker.off('error', failed); worker.off('exit', exited); };
      const receive = (value: { type: string }) => { if (value.type === type) { cleanup(); accept(value as T); } };
      const failed = (error: Error) => { cleanup(); reject(error); };
      const exited = (code: number) => { cleanup(); reject(new Error(`Race worker exited before ${type} (${code}).`)); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for race worker ${type}.`)); }, 12_000);
      worker.on('message', receive); worker.once('error', failed); worker.once('exit', exited);
    });
  }
  const release = () => { Atomics.store(new Int32Array(barrier), 0, 1); Atomics.notify(new Int32Array(barrier), 0); };
  return { message, release, async close() { release(); await worker.terminate(); } };
}

describe('Teacher End through the Student trusted coordinator', () => {
  it('picks the earliest accepted Submission and ignores client-sent winner fields', async () => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    expect((await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team2, 'B answer')).status).toBe(200);
    expect((await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'A answer')).status).toBe(200);
    const ended = await f.end({ winningSubmissionId: randomUUID(), acceptedOrder: 1, teamId: f.teams[0].teamId });
    expect(ended.status).toBe(200);
    expect(ended.body.data.phase).toBe('Ended');
    expect(f.resultTeam()).toEqual([f.teams[1].teamId]);
  });

  it('rejects a Submission that arrives after End (End first) and keeps the result consistent', async () => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    expect((await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team2, 'B answer')).status).toBe(200);
    await f.end();
    const late = await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'late');
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(f.resultTeam()).toEqual([f.teams[1].teamId]);
    const count = f.server.database.prepare('SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?').get(roundId) as { n: number };
    expect(count.n).toBe(1);
  });

  it('ends with no Submission and creates no Result', async () => {
    const f = await setup();
    await f.openQuestion3();
    expect((await f.end()).status).toBe(200);
    expect(f.resultTeam()).toEqual([]);
  });

  it('replaces the result on reopen and clears it when the reopened Round has no Submission', async () => {
    const f = await setup();
    let roundId = await f.openQuestion3();
    await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team2, 'first');
    await f.end();
    expect(f.resultTeam()).toEqual([f.teams[1].teamId]);

    roundId = await f.openQuestion3();
    await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'second');
    await f.end();
    expect(f.resultTeam()).toEqual([f.teams[0].teamId]);

    await f.openQuestion3();
    await f.end();
    expect(f.resultTeam()).toEqual([]);
  });

  it('publishes the Ended snapshot only after Ended and Result are committed', async () => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'A answer');
    const seen: { phase: string; inTransaction: boolean; results: number }[] = [];
    vi.spyOn(f.server.statePublisher, 'publish').mockImplementation((snapshot) => {
      seen.push({
        phase: snapshot.phase,
        inTransaction: f.server.database.inTransaction,
        results: (f.server.database.prepare('SELECT COUNT(*) AS n FROM results WHERE round_id = ?').get(roundId) as { n: number }).n,
      });
      return true;
    });
    await f.end();
    expect(seen).toEqual([{ phase: 'Ended', inTransaction: false, results: 1 }]);
  });
});

describe('T068 formal composition transaction acceptance', () => {
  it.each(['submit', 'end'] as const)('overlaps real HTTP writers deterministically when %s owns the SQLite lock first', async first => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    await editDraft(f.server, f.sessionId, roundId, f.team1, { [f.blank3]: 'race answer' });
    const version = await f.version();
    f.server.database.pragma('busy_timeout = 0');
    const publish = vi.spyOn(f.server.statePublisher, 'publish');
    const failureCodes: string[] = [];
    const identityFailureCodes: string[] = [];
    const realTouch = StudentCredentialRepository.prototype.touchLastSeenIfOlder;
    vi.spyOn(StudentCredentialRepository.prototype, 'touchLastSeenIfOlder').mockImplementation(function (this: StudentCredentialRepository, ...args) {
      try { return realTouch.apply(this, args); }
      catch (error) { identityFailureCodes.push((error as {code:string}).code); throw error; }
    });
    if (first === 'submit') {
      const realEnd = f.server.endCoordinator!.endRound.bind(f.server.endCoordinator!);
      vi.spyOn(f.server.endCoordinator!, 'endRound').mockImplementation((input, actor) => {
        try { return realEnd(input, actor); }
        catch (error) { failureCodes.push((error as {code:string}).code); throw error; }
      });
    } else {
      const realSubmit = SubmissionService.prototype.submit;
      vi.spyOn(SubmissionService.prototype, 'submit').mockImplementation(function (this: SubmissionService, ...args) {
        try { return realSubmit.apply(this, args); }
        catch (error) { failureCodes.push((error as {code:string}).code); throw error; }
      });
    }
    const worker = raceWorker(f, roundId, first);
    let pendingRequest: Promise<unknown> | undefined;
    let pendingNotice: Promise<unknown> | null = null;
    try {
      const { url } = await worker.message<{url:string}>('ready');
      const locked = worker.message<{inTransaction:boolean}>('locked');
      const published = first === 'end' ? worker.message<{inTransaction:boolean;snapshot:SessionStateSnapshot}>('published') : null;
      pendingNotice = published;
      void published?.catch(() => {}); // Preserve the rejection for the assertion, without cleanup-time unhandled errors.
      const firstRequest = first === 'submit'
        ? submitPersisted(f, roundId, url).then(response => response)
        : request(url).post(`/api/v1/teacher/sessions/${f.sessionId}/rounds/end`).set('Cookie', f.auth.cookie)
          .set('Origin', TEACHER_TEST_ORIGIN).set('X-CSRF-Token', f.auth.csrfToken)
          .send({ expectedStateVersion: version }).then(response => response);
      pendingRequest = firstRequest;
      void firstRequest.catch(() => {});
      expect((await locked).inTransaction).toBe(true);
      // A different connection cannot see uncommitted data or acquire a second writer lock.
      expect(f.server.repositories.rounds.findById(roundId)?.phase).toBe('Active');
      expect(f.server.database.prepare('SELECT COUNT(*) n FROM submissions WHERE round_id=?').get(roundId)).toEqual({ n: 0 });
      const blocked = first === 'submit'
        ? await f.api.post(`${f.base}/rounds/end`, { expectedStateVersion: version })
        : await submitPersisted(f, roundId);
      expect(blocked.status).toBe(500);
      expect(blocked.body.error.code).toBe('INTERNAL_ERROR');
      if (first === 'submit') {
        expect(failureCodes).toEqual(['SQLITE_BUSY']);
        expect(identityFailureCodes).toEqual([]);
      } else {
        // The real HTTP path touches credential metadata before SubmissionService.
        // Even a conditional UPDATE needs the writer lock; do not mock authentication to bypass it.
        expect(identityFailureCodes).toEqual(['SQLITE_BUSY']);
        expect(failureCodes).toEqual([]);
      }
      expect(publish).not.toHaveBeenCalled();
      expect(f.server.database.prepare('SELECT status FROM team_round_drafts WHERE team_id=? AND round_id=?').get(f.teams[0].teamId, roundId))
        .toEqual({ status: 'editable' });
      worker.release();
      const committed = await firstRequest;
      expect(committed.status).toBe(200);
      if (first === 'submit') {
        expect(committed.body.data.acceptedOrder).toBe(1);
        const ended = await f.api.post(`${f.base}/rounds/end`, { expectedStateVersion: version });
        expect(ended.status).toBe(200);
        expect(f.server.repositories.results.findByRound(roundId)?.winningSubmissionId).toBe(committed.body.data.submissionId);
        expect(publish).toHaveBeenCalledTimes(1);
      } else {
        const notice = await published!;
        expect(notice).toMatchObject({ inTransaction: false, snapshot: { phase: 'Ended', stateVersion: version + 1 } });
        expect(f.server.repositories.rounds.findById(roundId)?.phase).toBe('Ended');
        expect(f.server.repositories.results.findByRound(roundId)).toBeNull();
        expect((await submitPersisted(f, roundId)).body.error.code).toBe('INVALID_PHASE');
        expect(failureCodes).toEqual(['INVALID_PHASE']); // After authentication succeeds, the real transaction rereads Ended.
        expect(publish).not.toHaveBeenCalled(); // End publication belongs to the worker's real composition.
      }
      const count = f.server.database.prepare('SELECT COUNT(*) n FROM submissions WHERE round_id=?').get(roundId);
      expect(count).toEqual({ n: first === 'submit' ? 1 : 0 });
      expect(await f.version()).toBe(version + 1);
    } finally {
      worker.release();
      await pendingRequest?.catch(() => {});
      await pendingNotice?.catch(() => {});
      await worker.close();
    }
  }, 20_000);

  it('uses the composed resolver on the shared transaction and exposes the committed Result before real publication', async () => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    const accepted = await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'winning answer');
    expect(accepted.status).toBe(200);
    const resolveWinner = StudentWinnerResolver.prototype.resolveWinnerInTransaction;
    const resolver = vi.spyOn(StudentWinnerResolver.prototype, 'resolveWinnerInTransaction').mockImplementation(function (this: StudentWinnerResolver, id) {
      expect(f.server.database.inTransaction).toBe(true);
      return resolveWinner.call(this, id);
    });
    const observer = new DatabaseManager({ sqlitePath: f.server.database.name, timeoutMs: 0 });
    try {
      const read = observer.open().prepare('SELECT r.phase, re.winning_submission_id FROM rounds r JOIN results re ON re.round_id=r.id WHERE r.id=?');
      const realPublish = f.server.statePublisher.publish.bind(f.server.statePublisher);
      const publish = vi.spyOn(f.server.statePublisher, 'publish').mockImplementation(snapshot => {
        expect(f.server.database.inTransaction).toBe(false);
        expect(read.get(roundId)).toEqual({ phase: 'Ended', winning_submission_id: accepted.body.data.submissionId });
        return realPublish(snapshot);
      });
      const ended = await f.end();
      expect(ended.status).toBe(200);
      expect(resolver).toHaveBeenCalledExactlyOnceWith(roundId);
      expect(publish).toHaveBeenCalledExactlyOnceWith(ended.body.data);
      const projected = await request(f.server.app).get(`/api/v1/student/sessions/${f.sessionId}/rounds/${roundId}/result`).set('Cookie', f.team2.cookie);
      expect(projected.status).toBe(200);
      expect(projected.body.data.winner).toMatchObject({ teamName: f.teams[0].name, answers: [{ blankId: f.blank3, value: 'winning answer' }] });
    } finally { observer.close(); }
  });

  it('rejects duplicate End with stale and fresh versions without changing Result or publishing twice', async () => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'first');
    const version = await f.version();
    const publish = vi.spyOn(f.server.statePublisher, 'publish');
    const resolver = vi.spyOn(StudentWinnerResolver.prototype, 'resolveWinnerInTransaction');
    const ended = await f.api.post(`${f.base}/rounds/end`, { expectedStateVersion: version });
    expect(ended.status).toBe(200);
    const persisted = f.server.repositories.results.findByRound(roundId);
    for (const [expectedStateVersion, code] of [[version, 'STALE_STATE'], [version + 1, 'INVALID_PHASE']] as const) {
      const repeated = await f.api.post(`${f.base}/rounds/end`, { expectedStateVersion });
      expect(repeated.status).toBe(409);
      expect(repeated.body.error.code).toBe(code);
      expect(f.server.repositories.results.findByRound(roundId)).toEqual(persisted);
      expect(await f.version()).toBe(version + 1);
    }
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it.each(['resolver', 'persistence'] as const)('rolls back a composed %s failure, retains the previous winner and publishes nothing', async failure => {
    const f = await setup();
    const oldRound = await f.openQuestion3();
    await submitAnswer(f.server, f.sessionId, oldRound, f.blank3, f.team2, 'previous answer');
    expect((await f.end()).status).toBe(200);
    const previous = f.server.repositories.results.findByRound(oldRound);
    const roundId = await f.openQuestion3();
    await editDraft(f.server, f.sessionId, roundId, f.team1, { [f.blank3]: 'race answer' });
    if (failure === 'persistence') expect((await submitPersisted(f, roundId)).status).toBe(200);
    const version = await f.version();
    const draftBefore = f.server.database.prepare('SELECT * FROM team_round_drafts WHERE team_id=? AND round_id=?').get(f.teams[0].teamId, roundId);
    const publish = vi.spyOn(f.server.statePublisher, 'publish');
    const resolver = failure === 'resolver'
      ? vi.spyOn(StudentWinnerResolver.prototype, 'resolveWinnerInTransaction').mockImplementationOnce(() => {
        expect(f.server.database.inTransaction).toBe(true);
        throw new Error('Injected winner failure');
      }) : null;
    if (failure === 'persistence') f.server.database.exec("CREATE TEMP TRIGGER test_abort_result AFTER INSERT ON results BEGIN SELECT RAISE(ABORT,'Injected Result failure'); END");
    try {
      const failed = await f.end();
      expect(failed.status).toBe(500);
      expect(failed.body.error.code).toBe('INTERNAL_ERROR');
      expect(f.server.database.inTransaction).toBe(false);
      expect(f.server.repositories.rounds.findById(roundId)?.phase).toBe('Active');
      expect(await f.version()).toBe(version);
      expect(f.server.repositories.results.findByRound(oldRound)).toEqual(previous);
      expect(f.server.repositories.results.findByRound(roundId)).toBeNull();
      expect(f.server.database.prepare('SELECT * FROM team_round_drafts WHERE team_id=? AND round_id=?').get(f.teams[0].teamId, roundId)).toEqual(draftBefore);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      resolver?.mockRestore();
      if (failure === 'persistence') f.server.database.exec('DROP TRIGGER test_abort_result');
    }
    if (failure === 'resolver') expect((await submitPersisted(f, roundId)).status).toBe(200);
    const retried = await f.end();
    expect(retried.status).toBe(200);
    expect(f.server.repositories.results.findByRound(oldRound)).toBeNull();
    expect(f.resultTeam()).toEqual([f.teams[0].teamId]);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it.each(['question', 'questionGroup'] as const)('clears a reopened %s with no Submission without touching another Session or target', async kind => {
    const f = await setup();
    const isolated = await createActivity(f.server, f.auth);
    const isolatedTargets = seedQuestionGroupTargets(f.server, isolated.sessionId);
    const isolatedTeam = (await f.api.get(`/sessions/${isolated.sessionId}`)).body.data.teams[0].teamId;
    const isolatedStudent = await joinStudent(f.server, isolated.sessionId, isolatedTeam, 'Unrelated');
    const isolatedRound = await openTarget(f, isolated.sessionId, { kind: 'question', questionId: isolatedTargets.question3 });
    await submitAnswers(f.server, isolated.sessionId, isolatedRound.currentRoundId!, isolatedStudent, { [isolatedTargets.blanks[isolatedTargets.question3][0]]: 'unrelated' });
    expect((await f.api.post(`/sessions/${isolated.sessionId}/rounds/end`, { expectedStateVersion: isolatedRound.stateVersion })).status).toBe(200);
    const isolatedResult = f.server.repositories.results.findByRound(isolatedRound.currentRoundId!);
    const otherTarget = await openTarget(f, f.sessionId, { kind: 'question', questionId: f.targets.question4 });
    await submitAnswers(f.server, f.sessionId, otherTarget.currentRoundId!, f.team1, { [f.targets.blanks[f.targets.question4][0]]: 'other target' });
    expect((await f.end()).status).toBe(200);
    const otherResult = f.server.repositories.results.findByRound(otherTarget.currentRoundId!);
    const target: RoundTargetReference = kind === 'question'
      ? { kind, questionId: f.targets.question3 } : { kind, questionGroupId: f.targets.group1 };
    const answers = kind === 'question' ? { [f.blank3]: 'old answer' }
      : Object.fromEntries(f.targets.group1Questions.map(id => [f.targets.blanks[id][0], 'group answer']));
    const old = await openTarget(f, f.sessionId, target);
    expect((await submitAnswers(f.server, f.sessionId, old.currentRoundId!, f.team1, answers)).status).toBe(200);
    expect((await f.end()).status).toBe(200);
    expect(f.server.repositories.results.findByRound(old.currentRoundId!)).not.toBeNull();
    const reopened = await openTarget(f, f.sessionId, target);
    expect(reopened.currentRoundId).not.toBe(old.currentRoundId);
    expect((await f.end()).status).toBe(200);
    expect(f.server.repositories.results.findByRound(old.currentRoundId!)).toBeNull();
    expect(f.server.repositories.results.findByRound(reopened.currentRoundId!)).toBeNull();
    expect(f.server.repositories.results.findByRound(isolatedRound.currentRoundId!)).toEqual(isolatedResult);
    expect(f.server.repositories.results.findByRound(otherTarget.currentRoundId!)).toEqual(otherResult);
    const projection = await request(f.server.app).get(`/api/v1/student/sessions/${f.sessionId}/rounds/${reopened.currentRoundId}/result`).set('Cookie', f.team1.cookie);
    expect(projection.body.data).toEqual({ roundId: reopened.currentRoundId, winner: null });
    const draft = await request(f.server.app).get(`/api/v1/student/sessions/${f.sessionId}/rounds/${reopened.currentRoundId}/draft`).set('Cookie', f.team1.cookie);
    expect(draft.status).toBe(409);
    const next = await openTarget(f, f.sessionId, target);
    const fresh = await request(f.server.app).get(`/api/v1/student/sessions/${f.sessionId}/rounds/${next.currentRoundId}/draft`).set('Cookie', f.team1.cookie);
    expect(fresh.body.data).toMatchObject({ version: 0, status: 'editable', answers: [] });
  });

  it('returns committed HTTP success and logs publication failure without retrying the End transaction', async () => {
    const f = await setup();
    const roundId = await f.openQuestion3();
    const accepted = await submitAnswer(f.server, f.sessionId, roundId, f.blank3, f.team1, 'saved');
    const version = await f.version();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const publish = vi.spyOn(f.server.statePublisher, 'publish').mockImplementation(() => { throw new Error('Injected notification failure'); });
    const ended = await f.end();
    expect(ended.status).toBe(200);
    expect(ended.body.data).toMatchObject({ phase: 'Ended', stateVersion: version + 1 });
    expect(f.server.database.inTransaction).toBe(false);
    expect(f.server.repositories.results.findByRound(roundId)?.winningSubmissionId).toBe(accepted.body.data.submissionId);
    expect(log).toHaveBeenCalledExactlyOnceWith('Session End notification failed after commit.', expect.objectContaining({ sessionId: f.sessionId, stateVersion: version + 1 }));
    const state = await request(f.server.app).get(`/api/v1/sessions/${f.sessionId}/state`).set('Cookie', f.team1.cookie);
    expect(state.body.data).toEqual(ended.body.data);
    expect((await f.end()).status).toBe(409);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await f.version()).toBe(version + 1);
  });
});
