import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import { createTeacherSocketIdentity } from '../../apps/server/src/modules/teacher/auth/teacher-socket-identity.js';
import {
  createActivity,
  createTeacherTestServer,
  loginAsTeacher,
  seedQuestionGroupTargets,
  teacherApi,
  TEACHER_TEST_ORIGIN,
  type TeacherTestServer,
} from '../helpers/teacher.js';

const clients: ClientSocket[] = [];
const servers: TeacherTestServer[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.socketServer.close(() => resolve()));
});

async function listen() {
  const server = createTeacherTestServer({ withStudents: true });
  servers.push(server);
  server.httpServer.listen(0, '127.0.0.1');
  await once(server.httpServer, 'listening');
  const { port } = server.httpServer.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

function open(url: string, options: { cookie?: string; origin?: string; auth?: Record<string, unknown> } = {}) {
  const client = connectSocket(url, {
    transports: ['websocket'], forceNew: true, reconnection: false, timeout: 2_000,
    ...(options.auth ? { auth: options.auth } : {}),
    extraHeaders: { ...(options.cookie ? { Cookie: options.cookie } : {}), ...(options.origin ? { Origin: options.origin } : {}) },
  });
  clients.push(client);
  return client;
}

function next<T>(client: ClientSocket, event: string, ms = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    client.once(event, (value: T) => { clearTimeout(timer); resolve(value); });
  });
}

async function teacherWithActivity() {
  const { server, url } = await listen();
  const auth = await loginAsTeacher(server);
  const { sessionId } = await createActivity(server, auth);
  seedQuestionGroupTargets(server, sessionId);
  return { server, url, auth, sessionId, api: teacherApi(server, auth) };
}

describe('Teacher Socket identity', () => {
  it('lets a logged-in Teacher from an allowed Origin watch a Session and see changes within 2 s', async () => {
    const { url, auth, sessionId, api } = await teacherWithActivity();
    const client = open(url, { cookie: auth.cookie, origin: TEACHER_TEST_ORIGIN });
    await next(client, 'connect');
    client.emit('session:watch', { sessionId });
    const snapshot = await next<{ sessionId: string; phase: string; stateVersion: number }>(client, 'session:state');
    expect(snapshot).toMatchObject({ sessionId, phase: 'Waiting' });
    const changed = next<{ phase: string }>(client, 'session:state:changed');
    const started = Date.now();
    await api.post(`/sessions/${sessionId}/rounds/next`, { expectedStateVersion: snapshot.stateVersion });
    expect((await changed).phase).toBe('Waiting');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it.each([
    ['no cookie', { origin: TEACHER_TEST_ORIGIN }],
    ['a forged cookie', { cookie: 'teacher_session=forged', origin: TEACHER_TEST_ORIGIN }],
  ])('rejects a watch with %s', async (_label, options) => {
    const { url, sessionId } = await teacherWithActivity();
    const client = open(url, options);
    await next(client, 'connect');
    client.emit('session:watch', { sessionId });
    expect((await next<{ code: string }>(client, 'session:error')).code).toBe('UNAUTHENTICATED');
  });

  it('rejects a valid Teacher cookie from a disallowed or missing Origin', async () => {
    const { url, auth, sessionId } = await teacherWithActivity();
    for (const origin of ['http://evil.example', undefined]) {
      const client = open(url, { cookie: auth.cookie, origin });
      await next(client, 'connect');
      client.emit('session:watch', { sessionId });
      expect((await next<{ code: string }>(client, 'session:error')).code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects the watch after logout', async () => {
    const { server, url, auth, sessionId } = await teacherWithActivity();
    await teacherApi(server, auth).post('/auth/logout');
    const client = open(url, { cookie: auth.cookie, origin: TEACHER_TEST_ORIGIN });
    await next(client, 'connect');
    client.emit('session:watch', { sessionId });
    expect((await next<{ code: string }>(client, 'session:error')).code).toBe('UNAUTHENTICATED');
  });

  it('does not fall back to Teacher when the Student path (auth.sessionId) fails', async () => {
    const { url, auth, sessionId } = await teacherWithActivity();
    const client = open(url, { cookie: auth.cookie, origin: TEACHER_TEST_ORIGIN, auth: { sessionId } });
    const error = await next<Error>(client, 'connect_error');
    expect(error.message).toMatch(/STUDENT/);
  });

  it('forbids watching an unknown Session', async () => {
    const { url, auth } = await teacherWithActivity();
    const client = open(url, { cookie: auth.cookie, origin: TEACHER_TEST_ORIGIN });
    await next(client, 'connect');
    client.emit('session:watch', { sessionId: '00000000-0000-4000-8000-00000000dead' });
    expect((await next<{ code: string }>(client, 'session:error')).code).toBe('FORBIDDEN');
  });

  it('authorizes only ActorContext objects created by its own resolver', async () => {
    const { server, sessionId } = await teacherWithActivity();
    const identity = createTeacherSocketIdentity({
      database: server.database,
      allowedOrigins: [TEACHER_TEST_ORIGIN],
      verifyCookie: () => ({ idDigest: 'x'.repeat(64), expiresAt: '2099-01-01T00:00:00.000Z' }),
    });
    const lookalike = { actorKind: 'teacher' as const, actorId: 'teacher', permissions: ['session:watch'] };
    expect(identity.authorizeWatch(lookalike, sessionId as UUID)).toBe(false);
  });
});
