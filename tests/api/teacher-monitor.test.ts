import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import {
  createActivity,
  createTeacherTestServer,
  editDraft,
  joinStudent,
  loginAsTeacher,
  seedQuestionGroupTargets,
  submitAnswers,
  teacherApi,
} from '../helpers/teacher.js';

async function setup() {
  const server = createTeacherTestServer({ withStudents: true });
  const auth = await loginAsTeacher(server);
  const api = teacherApi(server, auth);
  const { sessionId } = await createActivity(server, auth, 3);
  const targets = seedQuestionGroupTargets(server, sessionId);
  const base = `/sessions/${sessionId}`;
  const version = async () => (await api.get(base)).body.data.state.stateVersion as number;
  const teams = (await api.get(base)).body.data.teams as { teamId: UUID; name: string }[];
  const students = [
    await joinStudent(server, sessionId, teams[0].teamId, 'A'),
    await joinStudent(server, sessionId, teams[1].teamId, 'B'),
    await joinStudent(server, sessionId, teams[2].teamId, 'C'),
  ];
  // Target 1 is a group of two one-blank questions.
  const [q1, q2] = targets.group1Questions;
  const groupAnswers = (a: string, b: string) => ({ [targets.blanks[q1][0]]: a, [targets.blanks[q2][0]]: b });
  const open = async (target: object) => {
    await api.post(`${base}/rounds/select`, { target, expectedStateVersion: await version() });
    return (await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() })).body.data.currentRoundId as UUID;
  };
  const end = async () => api.post(`${base}/rounds/end`, { expectedStateVersion: await version() });
  return { server, api, base, sessionId, targets, teams, students, groupAnswers, open, end };
}

describe('Teacher monitor and results', () => {
  it('shows every Team as not submitted before any submission, and an empty view without a Round', async () => {
    const f = await setup();
    const empty = await f.api.get(`${f.base}/monitor`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({ roundId: null, phase: 'Waiting' });
    expect(empty.body.data.teams.map((t: { submitted: boolean }) => t.submitted)).toEqual([false, false, false]);
    const roundId = await f.open({ kind: 'questionGroup', questionGroupId: f.targets.group1 });
    const view = (await f.api.get(`${f.base}/monitor`)).body.data;
    expect(view).toMatchObject({ roundId, phase: 'Active' });
    expect(view.teams).toEqual(f.teams.map((team) => ({
      teamId: team.teamId, teamName: team.name, submitted: false, acceptedOrder: null, receivedAt: null, answers: [],
    })));
  });

  it('lists submitted Teams with order and per-blank answers, and never draft data', async () => {
    const f = await setup();
    const roundId = await f.open({ kind: 'questionGroup', questionGroupId: f.targets.group1 });
    expect((await submitAnswers(f.server, f.sessionId, roundId, f.students[1], f.groupAnswers('B-one', 'B-two'))).status).toBe(200);
    expect((await submitAnswers(f.server, f.sessionId, roundId, f.students[0], f.groupAnswers('A-one', 'A-two'))).status).toBe(200);
    await editDraft(f.server, f.sessionId, roundId, f.students[2], f.groupAnswers('DRAFT-SECRET', 'draft'));
    const response = await f.api.get(`${f.base}/monitor`);
    expect(JSON.stringify(response.body)).not.toContain('DRAFT-SECRET');
    const byName = Object.fromEntries(response.body.data.teams.map((t: { teamName: string }) => [t.teamName, t]));
    expect(byName['第2組']).toMatchObject({ submitted: true, acceptedOrder: 1, receivedAt: expect.any(String) });
    expect(byName['第2組'].answers.map((a: { label: string; value: string }) => [a.label, a.value])).toEqual([['（1）', 'B-one'], ['（2）', 'B-two']]);
    expect(byName['第1組']).toMatchObject({ submitted: true, acceptedOrder: 2 });
    expect(byName['第3組']).toMatchObject({ submitted: false, acceptedOrder: null, answers: [] });
  });

  it('rejects Student cookies and anonymous requests', async () => {
    const f = await setup();
    expect((await request(f.server.app).get(`/api/v1/teacher${f.base}/monitor`).set('Cookie', f.students[0].cookie)).status).toBe(401);
    expect((await request(f.server.app).get(`/api/v1/teacher${f.base}/results`)).status).toBe(401);
  });

  it('returns results only for Ended Rounds, with full order and the winner', async () => {
    const f = await setup();
    const roundId = await f.open({ kind: 'questionGroup', questionGroupId: f.targets.group1 });
    await submitAnswers(f.server, f.sessionId, roundId, f.students[1], f.groupAnswers('B-one', 'B-two'));
    await submitAnswers(f.server, f.sessionId, roundId, f.students[0], f.groupAnswers('A-one', 'A-two'));
    const early = await f.api.get(`${f.base}/results`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('INVALID_PHASE');
    await f.end();
    const result = (await f.api.get(`${f.base}/results`)).body.data;
    expect(result).toMatchObject({ roundId, number: '1', roundNumber: 1, target: { kind: 'questionGroup', questionGroupId: f.targets.group1 } });
    expect(result.submissions.map((s: { teamName: string; acceptedOrder: number }) => [s.teamName, s.acceptedOrder])).toEqual([['第2組', 1], ['第1組', 2]]);
    expect(result.winner.teamName).toBe('第2組');
    expect(result.winner.answers.map((a: { value: string }) => a.value)).toEqual(['B-one', 'B-two']);
  });

  it('shows no winner when nobody submitted', async () => {
    const f = await setup();
    await f.open({ kind: 'question', questionId: f.targets.question3 });
    await f.end();
    const result = (await f.api.get(`${f.base}/results`)).body.data;
    expect(result).toMatchObject({ submissions: [], winner: null, roundNumber: 1 });
  });

  it('keeps an earlier Round readable after reopen, using the earliest accepted Submission as its winner', async () => {
    const f = await setup();
    const blank = f.targets.blanks[f.targets.question3][0];
    const first = await f.open({ kind: 'question', questionId: f.targets.question3 });
    await submitAnswers(f.server, f.sessionId, first, f.students[2], { [blank]: 'first-C' });
    await f.end();
    const second = await f.open({ kind: 'question', questionId: f.targets.question3 });
    await submitAnswers(f.server, f.sessionId, second, f.students[0], { [blank]: 'second-A' });
    await f.end();
    const latest = (await f.api.get(`${f.base}/results`)).body.data;
    expect(latest).toMatchObject({ roundId: second, roundNumber: 2 });
    expect(latest.winner.teamName).toBe('第1組');
    const older = (await f.api.get(`${f.base}/results?roundId=${first}`)).body.data;
    expect(older).toMatchObject({ roundId: first, roundNumber: 1 });
    expect(older.winner.teamName).toBe('第3組');
  });

  it('validates roundId and rejects Rounds of another activity', async () => {
    const f = await setup();
    const other = await setup();
    const foreign = await other.open({ kind: 'question', questionId: other.targets.question3 });
    await other.end();
    expect((await f.api.get(`${f.base}/results?roundId=not-a-uuid`)).status).toBe(400);
    const response = await f.api.get(`${f.base}/results?roundId=${foreign}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TARGET_NOT_FOUND');
  });
});
