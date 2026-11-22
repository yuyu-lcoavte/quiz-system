import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import {
  createActivity,
  createTeacherTestServer,
  loginAsTeacher,
  seedQuestionGroupTargets,
  teacherApi,
  TEACHER_TEST_ORIGIN,
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
  return { server, api, sessionId, teams, team1, team2, blank3, openQuestion3, end, resultTeam };
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
