import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ids, session } from '../helpers/foundation.js';
import {
  createTeacherTestServer,
  loginAsTeacher,
  TEACHER_TEST_ORIGIN,
  TEACHER_TEST_PASSWORD,
} from '../helpers/teacher.js';

const LOGIN = '/api/v1/teacher/auth/login';
const LOGOUT = '/api/v1/teacher/auth/logout';
const ME = '/api/v1/teacher/me';

function clock(start = '2026-11-22T01:00:00.000Z') {
  let current = Date.parse(start);
  return { now: () => new Date(current), advance: (ms: number) => { current += ms; } };
}

describe('Teacher login API', () => {
  it('sets an HttpOnly, SameSite=Strict, Path=/ cookie for 8 hours on success', async () => {
    const server = createTeacherTestServer();
    const response = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: TEACHER_TEST_PASSWORD });
    expect(response.status).toBe(204);
    const cookie = String(response.headers['set-cookie'][0]);
    expect(cookie).toMatch(/^teacher_session=[^;]+/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=28800/);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('marks the cookie Secure in production', async () => {
    const server = createTeacherTestServer({ env: { NODE_ENV: 'production' } });
    const response = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: TEACHER_TEST_PASSWORD });
    expect(String(response.headers['set-cookie'][0])).toMatch(/Secure/i);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS and no cookie', async () => {
    const server = createTeacherTestServer();
    const response = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: 'wrong' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a malformed login body with INVALID_INPUT', async () => {
    const server = createTeacherTestServer();
    const response = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('requires an allowed Origin on login', async () => {
    const server = createTeacherTestServer();
    for (const origin of [undefined, 'http://evil.example']) {
      const call = request(server.app).post(LOGIN).send({ password: TEACHER_TEST_PASSWORD });
      const response = await (origin ? call.set('Origin', origin) : call);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('returns 429 after 5 failed attempts and lets the window pass', async () => {
    const time = clock();
    const server = createTeacherTestServer({ now: time.now });
    for (let i = 0; i < 5; i += 1) {
      await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: 'wrong' });
    }
    const blocked = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: TEACHER_TEST_PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    time.advance(15 * 60_000);
    const allowed = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: TEACHER_TEST_PASSWORD });
    expect(allowed.status).toBe(204);
  });

  it('returns a CSRF token from /me with no-store caching', async () => {
    const server = createTeacherTestServer();
    const { cookie } = await loginAsTeacher(server);
    const response = await request(server.app).get(ME).set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({
      authenticated: true,
      csrfToken: expect.any(String),
      expiresAt: expect.any(String),
      serviceAccountEmail: null,
    });
  });

  it('rejects missing, tampered and unknown cookies with 401', async () => {
    const server = createTeacherTestServer();
    const { cookie } = await loginAsTeacher(server);
    expect((await request(server.app).get(ME)).status).toBe(401);
    expect((await request(server.app).get(ME).set('Cookie', `${cookie}x`)).status).toBe(401);
    const [name, value] = cookie.split('=');
    const [id, signature] = value.split('.');
    expect((await request(server.app).get(ME).set('Cookie', `${name}=${id.slice(0, -2)}AA.${signature}`)).status).toBe(401);
    expect((await request(server.app).get(ME).set('Cookie', 'teacher_session=forged')).status).toBe(401);
  });

  it('expires the login after 8 hours', async () => {
    const time = clock();
    const server = createTeacherTestServer({ now: time.now });
    const { cookie } = await loginAsTeacher(server);
    time.advance(8 * 60 * 60_000 - 1);
    expect((await request(server.app).get(ME).set('Cookie', cookie)).status).toBe(200);
    time.advance(1);
    expect((await request(server.app).get(ME).set('Cookie', cookie)).status).toBe(401);
  });

  it('logs out only the calling device and clears its cookie', async () => {
    const server = createTeacherTestServer();
    const first = await loginAsTeacher(server);
    const second = await loginAsTeacher(server);
    const response = await request(server.app).post(LOGOUT).set('Origin', TEACHER_TEST_ORIGIN)
      .set('Cookie', first.cookie).set('X-CSRF-Token', first.csrfToken);
    expect(response.status).toBe(204);
    expect(String(response.headers['set-cookie'][0])).toMatch(/teacher_session=;.*Max-Age=0/i);
    expect((await request(server.app).get(ME).set('Cookie', first.cookie)).status).toBe(401);
    expect((await request(server.app).get(ME).set('Cookie', second.cookie)).status).toBe(200);
  });

  it('requires CSRF and an allowed Origin on mutations after login', async () => {
    const server = createTeacherTestServer();
    const first = await loginAsTeacher(server);
    const second = await loginAsTeacher(server);
    const noToken = await request(server.app).post(LOGOUT).set('Origin', TEACHER_TEST_ORIGIN).set('Cookie', first.cookie);
    expect(noToken.status).toBe(403);
    const otherSessionToken = await request(server.app).post(LOGOUT).set('Origin', TEACHER_TEST_ORIGIN)
      .set('Cookie', first.cookie).set('X-CSRF-Token', second.csrfToken);
    expect(otherSessionToken.status).toBe(403);
    const badOrigin = await request(server.app).post(LOGOUT).set('Origin', 'http://evil.example')
      .set('Cookie', first.cookie).set('X-CSRF-Token', first.csrfToken);
    expect(badOrigin.status).toBe(403);
  });

  it('gives no Teacher identity on shared /api/v1/sessions reads', async () => {
    const server = createTeacherTestServer();
    server.repositories.sessions.create(session());
    const { cookie } = await loginAsTeacher(server);
    const response = await request(server.app).get(`/api/v1/sessions/${ids.session1}/current-target`).set('Cookie', cookie);
    expect(response.status).toBe(401);
  });

  it('answers 503 TEACHER_NOT_CONFIGURED when login is not configured', async () => {
    const server = createTeacherTestServer({ env: { TEACHER_PASSWORD_HASH: undefined } });
    const response = await request(server.app).post(LOGIN).set('Origin', TEACHER_TEST_ORIGIN).send({ password: TEACHER_TEST_PASSWORD });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('TEACHER_NOT_CONFIGURED');
  });

  it('never returns the password hash or secret', async () => {
    const server = createTeacherTestServer();
    const { cookie } = await loginAsTeacher(server);
    const body = JSON.stringify((await request(server.app).get(ME).set('Cookie', cookie)).body);
    expect(body).not.toContain(server.config.passwordHash!);
    expect(body).not.toContain(server.config.sessionSecret!);
  });
});
