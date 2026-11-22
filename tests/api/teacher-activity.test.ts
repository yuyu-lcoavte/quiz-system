import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTeacherTestServer, loginAsTeacher, teacherApi, TEACHER_TEST_ORIGIN } from '../helpers/teacher.js';

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

async function setup() {
  const server = createTeacherTestServer({ withStudents: true });
  const api = teacherApi(server, await loginAsTeacher(server));
  return { server, api };
}

describe('Teacher activities', () => {
  it('creates an activity with a 6-character code and Teams 第1組…第N組', async () => {
    const { api } = await setup();
    const response = await api.post('/sessions', { teamCount: 3 });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ teamCount: 3, phase: 'Waiting', imported: false });
    expect(response.body.data.activityCode).toMatch(CODE_PATTERN);
    const detail = await api.get(`/sessions/${response.body.data.sessionId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.teams.map((team: { name: string }) => team.name)).toEqual(['第1組', '第2組', '第3組']);
    expect(detail.body.data).toMatchObject({
      sessionId: response.body.data.sessionId,
      activityCode: response.body.data.activityCode,
      state: { phase: 'Waiting', currentRoundId: null, stateVersion: 0 },
      targets: [],
      source: null,
    });
  });

  it('accepts 1 and 20 Teams and rejects 0, 21 and 2.5', async () => {
    const { api } = await setup();
    expect((await api.post('/sessions', { teamCount: 1 })).status).toBe(201);
    expect((await api.post('/sessions', { teamCount: 20 })).status).toBe(201);
    for (const teamCount of [0, 21, 2.5, '2']) {
      const response = await api.post('/sessions', { teamCount });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    }
  });

  it('gives each activity a unique code and lists newest first', async () => {
    const { api } = await setup();
    const codes = new Set<string>();
    for (let i = 0; i < 15; i += 1) codes.add((await api.post('/sessions', { teamCount: 1 })).body.data.activityCode);
    expect(codes.size).toBe(15);
    const list = await api.get('/sessions');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(15);
    const created = list.body.data.map((item: { createdAt: string }) => item.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });

  it('lets students choose exactly the created Teams by activity code', async () => {
    const { server, api } = await setup();
    const { activityCode } = (await api.post('/sessions', { teamCount: 2 })).body.data;
    const options = await request(server.app).get(`/api/v1/student/join-options/${activityCode}`);
    expect(options.status).toBe(200);
    expect(options.body.data.teams.map((team: { name: string }) => team.name)).toEqual(['第1組', '第2組']);
  });

  it('returns 404 for an unknown activity and 400 for a malformed id', async () => {
    const { api } = await setup();
    expect((await api.get('/sessions/00000000-0000-4000-8000-00000000abcd')).body.error.code).toBe('SESSION_NOT_FOUND');
    expect((await api.get('/sessions/not-a-uuid')).status).toBe(400);
  });

  it('requires login, Origin and CSRF to create an activity', async () => {
    const { server } = await setup();
    expect((await request(server.app).post('/api/v1/teacher/sessions').set('Origin', TEACHER_TEST_ORIGIN).send({ teamCount: 2 })).status).toBe(401);
    const auth = await loginAsTeacher(server);
    expect((await request(server.app).post('/api/v1/teacher/sessions').set('Cookie', auth.cookie).set('Origin', TEACHER_TEST_ORIGIN).send({ teamCount: 2 })).status).toBe(403);
  });
});
