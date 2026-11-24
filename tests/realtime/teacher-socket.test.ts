import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { createTeacherSocketIdentity } from '../../apps/server/src/modules/teacher/auth/teacher-socket-identity.js';
import * as teacherSocketIdentityModule from '../../apps/server/src/modules/teacher/auth/teacher-socket-identity.js';
import { TeacherLoginSessionService } from '../../apps/server/src/modules/teacher/auth/login-session-service.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { getStudentSocketIdentity } from '../../apps/server/src/modules/student/realtime/student-draft-socket.js';
import { sessionRoomName } from '../../apps/server/src/realtime/session-room.js';
import {
  createActivity,
  createTeacherTestServer,
  loginAsTeacher,
  joinStudent,
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

async function studentWithActivity() {
  const f = await teacherWithActivity();
  const detail = await f.api.get(`/sessions/${f.sessionId}`);
  const teams = detail.body.data.teams as { teamId: UUID }[];
  const student = await joinStudent(f.server, f.sessionId, teams[0].teamId, 'Student A');
  return { ...f, student, teamId: teams[0].teamId };
}

function watch<T>(client: ClientSocket, sessionId: UUID, event: 'session:state' | 'session:error') {
  const response = next<T>(client, event);
  client.emit('session:watch', { sessionId });
  return response;
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

  it('requires resolver provenance, Teacher kind, watch permission and Session existence with a real signed Cookie', async () => {
    const { server, url, auth, sessionId } = await teacherWithActivity();
    const client = open(url, { cookie: auth.cookie, origin: TEACHER_TEST_ORIGIN });
    await next(client, 'connect');
    const socket = server.socketServer.sockets.sockets.get(client.id!)!;
    const sessions = new TeacherLoginSessionService(server.teacherRepositories.loginSessions, server.config.sessionSecret!, () => new Date());
    const identity = createTeacherSocketIdentity({
      database: server.database,
      allowedOrigins: [TEACHER_TEST_ORIGIN],
      verifyCookie: value => sessions.verify(value),
    });
    const actor = identity.resolveSocketActorContext(socket)!;
    expect(actor).toMatchObject({ actorKind: 'teacher', permissions: ['session:watch'] });
    expect(actor.sessionId).toBeUndefined();
    expect(identity.authorizeWatch(actor, sessionId)).toBe(true);
    expect(identity.authorizeWatch(actor, '00000000-0000-4000-8000-00000000dead' as UUID)).toBe(false);
    const lookalike = { actorKind: 'teacher' as const, actorId: 'teacher', permissions: ['session:watch'] };
    expect(identity.authorizeWatch(lookalike, sessionId as UUID)).toBe(false);
    // Mutate only this test-owned issued object: each guard must independently reject it.
    Object.assign(actor, { permissions: [] });
    expect(identity.authorizeWatch(actor, sessionId)).toBe(false);
    Object.assign(actor, { permissions: ['session:watch'], actorKind: 'participant' });
    expect(identity.authorizeWatch(actor, sessionId)).toBe(false);
  });
});

describe('T067 real Teacher/Student Socket boundary', () => {
  it('keeps mixed Cookies on the Student path and permits scoped draft operations, not a foreign Session', async () => {
    const f = await studentWithActivity();
    const other = await createActivity(f.server, f.auth);
    const client = open(f.url, { cookie: `${f.student.cookie}; ${f.auth.cookie}`, origin: TEACHER_TEST_ORIGIN,
      auth: { sessionId: f.sessionId, actorKind: 'teacher', teamId: 'forged-team', permissions: ['round:end', 'session:watch'] } });
    await next(client, 'connect');
    expect(getStudentSocketIdentity(f.server.socketServer.sockets.sockets.get(client.id!)!)?.actorContext)
      .toMatchObject({ actorKind: 'participant', sessionId: f.sessionId, teamId: f.teamId });
    expect(await watch<SessionStateSnapshot>(client, f.sessionId, 'session:state')).toMatchObject({ phase: 'Waiting' });
    expect(await watch<{code:string}>(client, other.sessionId, 'session:error')).toMatchObject({ code: 'FORBIDDEN' });
    expect(f.server.socketServer.sockets.sockets.get(client.id!)!.rooms.has(sessionRoomName(other.sessionId))).toBe(false);
    const selected = await f.api.post(`/sessions/${f.sessionId}/rounds/next`, { expectedStateVersion: 0 });
    expect(selected.status).toBe(200);
    const active = await f.api.post(`/sessions/${f.sessionId}/rounds/start`, { expectedStateVersion: selected.body.data.stateVersion });
    expect(active.status).toBe(200);
    const roundId = active.body.data.currentRoundId as UUID;
    const snapshot = next<{version:number;answers:unknown[]}>(client, 'student:draft:snapshot');
    client.emit('student:draft:watch', { sessionId: f.sessionId, roundId });
    expect(await snapshot).toMatchObject({ version: 0, answers: [] });
    const target = await request(f.server.app).get(`/api/v1/sessions/${f.sessionId}/current-target`).set('Cookie', f.student.cookie);
    expect(target.status).toBe(200);
    const blankId = target.body.data.target.questionGroup.questions[0].blanks[0].id as UUID;
    const edited = next<{answer:{value:string}}>(client, 'student:draft:changed');
    client.emit('student:draft:edit', { sessionId:f.sessionId,roundId,blankId,value:'Student draft',baseVersion:0,
      clientMutationId:crypto.randomUUID(),csrfToken:f.student.csrfToken });
    expect(await edited).toMatchObject({ answer: { value: 'Student draft' } });
    const denied = next<{code:string}>(client, 'student:draft:error');
    client.emit('student:draft:watch', { sessionId:other.sessionId,roundId });
    expect(await denied).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it.each([
    ['revoked', false], ['revoked', true], ['expired', false], ['expired', true],
  ] as const)('rejects an established %s Student without Teacher fallback (mixed Cookies: %s)', async (failure, mixed) => {
    // Capture the actual adapter returned during production composition; spies retain its implementation.
    const createdIdentity = vi.spyOn(teacherSocketIdentityModule, 'createTeacherSocketIdentity');
    const f = await studentWithActivity();
    expect(createdIdentity).toHaveBeenCalledOnce();
    const adapter = createdIdentity.mock.results[0].value as ReturnType<typeof createTeacherSocketIdentity>;
    const resolveTeacher = vi.spyOn(adapter, 'resolveSocketActorContext');
    const authorizeTeacher = vi.spyOn(adapter, 'authorizeWatch');
    const other = await createActivity(f.server, f.auth);
    const cookie = mixed ? `${f.student.cookie}; ${f.auth.cookie}` : f.student.cookie;
    const client = open(f.url, { cookie, origin: TEACHER_TEST_ORIGIN, auth: { sessionId: f.sessionId } });
    await next(client, 'connect');
    expect(await watch<SessionStateSnapshot>(client, f.sessionId, 'session:state')).toMatchObject({ sessionId: f.sessionId });
    const repositories = createStudentRepositories(f.server.database);
    const credential = new StudentIdentityService(repositories).resolve(f.student.cookie, f.sessionId)!;
    if (failure === 'revoked') repositories.credentials.revoke(credential.credentialId as UUID, new Date().toISOString());
    else {
      // Persist an expired interval satisfying expires_at > created_at; do not expire the Teacher Cookie.
      const now = Date.now();
      f.server.database.prepare('UPDATE student_browser_credentials SET created_at=?, expires_at=? WHERE id=?')
        .run(new Date(now-2000).toISOString(), new Date(now-1000).toISOString(), credential.credentialId);
    }
    expect((await request(f.server.app).get('/api/v1/teacher/me').set('Cookie', f.auth.cookie)).status).toBe(200);
    // Call-through spy observes the real verifier; it never replaces credential validation.
    const verifyTeacher = vi.spyOn(TeacherLoginSessionService.prototype, 'verify');
    const snapshots = vi.fn();
    client.on('session:state', snapshots);
    expect(await watch<{code:string}>(client, other.sessionId, 'session:error')).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await watch<{code:string}>(client, f.sessionId, 'session:error')).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(resolveTeacher).not.toHaveBeenCalled();
    expect(authorizeTeacher).not.toHaveBeenCalled();
    expect(verifyTeacher).not.toHaveBeenCalled();
    expect(snapshots).not.toHaveBeenCalled();
    expect(f.server.socketServer.sockets.sockets.get(client.id!)!.rooms.has(sessionRoomName(other.sessionId))).toBe(false);
    const retry = open(f.url, { cookie, origin: TEACHER_TEST_ORIGIN, auth: { sessionId: f.sessionId } });
    expect((await next<Error>(retry, 'connect_error')).message).toMatch(/STUDENT/);
    expect(resolveTeacher).not.toHaveBeenCalled();
    expect(authorizeTeacher).not.toHaveBeenCalled();
    expect(verifyTeacher).not.toHaveBeenCalled();
    // Positive control: these same spied adapters really are installed and still accept the valid Teacher.
    const teacherClient = open(f.url, { cookie: f.auth.cookie, origin: TEACHER_TEST_ORIGIN });
    await next(teacherClient, 'connect');
    expect(await watch<SessionStateSnapshot>(teacherClient, other.sessionId, 'session:state')).toMatchObject({ sessionId: other.sessionId });
    expect(resolveTeacher).toHaveBeenCalledOnce();
    expect(authorizeTeacher).toHaveBeenCalledOnce();
    expect(verifyTeacher).toHaveBeenCalledOnce();
  });

  it('does not grant Teacher authority to a Student Cookie or forged role claims without auth.sessionId', async () => {
    const f = await studentWithActivity();
    const client = open(f.url, { cookie: f.student.cookie, origin: TEACHER_TEST_ORIGIN,
      auth: { actorKind: 'teacher', permissions: ['session:watch', 'round:end'] } });
    await next(client, 'connect');
    expect(await watch<{code:string}>(client, f.sessionId, 'session:error')).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(f.server.socketServer.sockets.sockets.get(client.id!)!.rooms.has(sessionRoomName(f.sessionId))).toBe(false);
  });

  it('verifies the signature of a real Teacher Cookie on watch', async () => {
    const f = await teacherWithActivity();
    const dot = f.auth.cookie.lastIndexOf('.') + 1;
    const altered = f.auth.cookie.slice(0, dot) + (f.auth.cookie[dot] === 'A' ? 'B' : 'A') + f.auth.cookie.slice(dot + 1);
    const client = open(f.url, { cookie: altered, origin: TEACHER_TEST_ORIGIN });
    await next(client, 'connect');
    expect(await watch<{code:string}>(client, f.sessionId, 'session:error')).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(f.server.socketServer.sockets.sockets.get(client.id!)!.rooms.has(sessionRoomName(f.sessionId))).toBe(false);
  });

  it('rejects an expired real Teacher login on an already connected Socket', async () => {
    const f = await teacherWithActivity();
    const client = open(f.url, { cookie: f.auth.cookie, origin: TEACHER_TEST_ORIGIN });
    await next(client, 'connect');
    expect(await watch<SessionStateSnapshot>(client, f.sessionId, 'session:state')).toMatchObject({ phase: 'Waiting' });
    f.server.database.prepare('UPDATE teacher_login_sessions SET expires_at=?').run(new Date(Date.now()-1000).toISOString());
    expect(await watch<{code:string}>(client, f.sessionId, 'session:error')).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
