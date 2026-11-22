import { once } from 'node:events';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '@quiz/contracts/identity';
import { studentFixture, cookieOf } from '../helpers/student.js';
import { sessionRoomName } from '../../apps/server/src/realtime/session-room.js';
import { createHttpServer } from '../../apps/server/src/app.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { getStudentSocketIdentity, type StudentFoundationSocket } from '../../apps/server/src/modules/student/realtime/student-draft-socket.js';
import { createFoundationTestContext, ids, TIME } from '../helpers/foundation.js';

const origin = 'http://127.0.0.1:5173';
const token = 'student-cookie-token-with-enough-entropy-for-the-test-fixture-123';
const credentialId = '00000000-0000-4000-8000-000000000301' as typeof ids.session1;

async function openClient(serverUrl: string, options: { cookie?: string; origin?: string; auth?: Record<string, unknown> } = {}) {
  const client: ClientSocket = connectSocket(serverUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 2_000,
    auth: options.auth ?? { sessionId: ids.session1 },
    extraHeaders: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
    },
  });
  return client;
}

describe('Student Socket.IO handshake identity', () => {
  it('resolves the Path=/ browser cookie to canonical Participant/Team and ignores forged identity claims', async () => {
    const context = createFoundationTestContext();
    context.repositories.sessions.create({ id: ids.session1, activityCode: 'SOCKET-1', currentRoundId: null, stateVersion: 0, createdAt: TIME });
    context.repositories.teams.create({ id: ids.team1, sessionId: ids.session1, name: 'Team A', createdAt: TIME });
    context.repositories.participants.create({ id: ids.participant1, teamId: ids.team1, displayName: 'Learner', createdAt: TIME });
    const student = createStudentRepositories(context.database);
    student.credentials.create({ id: credentialId, tokenHash: (await import('../../apps/server/src/modules/student/application/student-identity-service.js')).hashStudentSessionToken(token), createdAt: TIME, expiresAt: '2026-11-11T01:00:00.000Z', revokedAt: null, lastSeenAt: TIME });
    student.browserParticipants.create({ credentialId, sessionId: ids.session1, participantId: ids.participant1, createdAt: TIME });
    const identity = new StudentIdentityService(student, { now: () => '2026-11-10T02:00:00.000Z' });
    const server = createHttpServer({ database: context.database, studentSocket: { allowedOrigins: [origin], resolveIdentity: (cookie, scope) => identity.resolve(cookie, scope) } });
    const observedIdentity = new Promise<ReturnType<typeof getStudentSocketIdentity>>((resolve) => {
      server.socketServer.on('connection', (socket) => resolve(getStudentSocketIdentity(socket as StudentFoundationSocket)));
    });
    server.httpServer.listen(0, '127.0.0.1');
    await once(server.httpServer, 'listening');
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Test socket server did not bind a TCP port.');
    const client = await openClient(`http://127.0.0.1:${address.port}`, {
      cookie: `student_session=${token}`,
      origin,
      auth: { sessionId: ids.session1, actorKind: 'teacher', teamId: ids.teamOtherSession },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', () => resolve());
        client.once('connect_error', reject);
      });
      expect(await observedIdentity).toMatchObject({
        sessionId: ids.session1,
        actorContext: { actorKind: 'participant', actorId: ids.participant1, teamId: ids.team1, sessionId: ids.session1 },
      });
      const invalidPayloadError = new Promise<{ code: string }>((resolve) => client.once('student:draft:error', resolve));
      client.emit('student:draft:watch', { sessionId: 'forged-session', roundId: ids.round1 });
      expect(await invalidPayloadError).toMatchObject({ code: 'INVALID_INPUT' });
    } finally {
      client.disconnect();
      await new Promise<void>((resolve) => server.socketServer.close(() => resolve()));
    }
  });

  it.each([
    ['missing cookie', undefined, origin],
    ['wrong Origin', `student_session=${token}`, 'https://evil.example'],
    ['missing Origin', `student_session=${token}`, undefined],
  ])('rejects a Student handshake with %s before connection', async (_label, cookie, requestOrigin) => {
    const context = createFoundationTestContext();
    context.repositories.sessions.create({ id: ids.session1, activityCode: 'SOCKET-1', currentRoundId: null, stateVersion: 0, createdAt: TIME });
    const identity = new StudentIdentityService(createStudentRepositories(context.database));
    const server = createHttpServer({ database: context.database, studentSocket: { allowedOrigins: [origin], resolveIdentity: (rawCookie, scope) => identity.resolve(rawCookie, scope) } });
    server.httpServer.listen(0, '127.0.0.1');
    await once(server.httpServer, 'listening');
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Test socket server did not bind a TCP port.');
    const client = await openClient(`http://127.0.0.1:${address.port}`, { cookie, origin: requestOrigin });
    try {
      const error = await new Promise<Error>((resolve) => client.once('connect_error', resolve));
      expect(error).toBeInstanceOf(Error);
      expect(client.connected).toBe(false);
    } finally {
      client.disconnect();
      await new Promise<void>((resolve) => server.socketServer.close(() => resolve()));
    }
  });
});

function watchResponse(client: ClientSocket, sessionId = ids.session1): Promise<{ event: string; payload: { code?: string; phase?: string } }> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); client.off('session:error', error); client.off('session:state', state); };
    const error = (payload: { code?: string }) => { cleanup(); resolve({ event: 'session:error', payload }); };
    const state = (payload: { phase?: string }) => { cleanup(); resolve({ event: 'session:state', payload }); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Watch did not reply')); }, 2500);
    client.once('session:error', error);
    client.once('session:state', state);
    client.emit('session:watch', { sessionId });
  });
}

it.each(['revoked', 'expired'] as const)('rejects a %s Student on watch without falling back even with a Teacher Cookie', async failure => {
  const f = studentFixture();
  const joined = await f.join('Student');
  let now = new Date().toISOString();
  const identity = new StudentIdentityService(createStudentRepositories(f.database), { now: () => now });
  const credential = identity.resolve(cookieOf(joined), ids.session1)!;
  // Controlled external adapter deliberately accepts the test Teacher Cookie.
  // The Student route must never invoke it after Student validation fails.
  const external = vi.fn((): ActorContext => ({ actorKind: 'teacher', actorId: 'controlled-teacher', permissions: ['session:watch'] }));
  const authorize = vi.fn(() => true);
  const server = createHttpServer({ database: f.database,
    studentSocket: { allowedOrigins: [origin], resolveIdentity: (cookie, scope) => identity.resolve(cookie, scope) },
    resolveSocketActorContext: external, authorizeWatch: authorize });
  server.httpServer.listen(0, '127.0.0.1');
  await once(server.httpServer, 'listening');
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const client = await openClient(`http://127.0.0.1:${address.port}`, { cookie: cookieOf(joined) + '; teacher_session=controlled-test-cookie', origin });
  try {
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    if (failure === 'revoked') {
      f.database.prepare('UPDATE student_browser_credentials SET revoked_at=? WHERE id=?').run(now, credential.credentialId);
    } else {
      now = new Date(Date.now() + 2 * 86400000).toISOString();
    }
    expect(await watchResponse(client, ids.session2)).toMatchObject({ event: 'session:error', payload: { code: 'UNAUTHENTICATED' } });
    expect(external).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
    expect(server.socketServer.sockets.sockets.get(client.id!)?.rooms.has(sessionRoomName(ids.session2))).toBe(false);
  } finally {
    client.disconnect();
    await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
  }
});

it('uses the Student route on mixed Cookies and rejects a foreign Session without calling Teacher adapters', async () => {
  const f = studentFixture();
  const joined = await f.join('Student');
  const external = vi.fn((): ActorContext => ({ actorKind: 'teacher', actorId: 'controlled-teacher', permissions: ['session:watch'] }));
  const authorize = vi.fn(() => true);
  const identity = new StudentIdentityService(createStudentRepositories(f.database));
  const server = createHttpServer({ database: f.database,
    studentSocket: { allowedOrigins: [origin], resolveIdentity: (cookie, scope) => identity.resolve(cookie, scope) },
    resolveSocketActorContext: external, authorizeWatch: authorize });
  server.httpServer.listen(0, '127.0.0.1');
  await once(server.httpServer, 'listening');
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const client = await openClient(`http://127.0.0.1:${address.port}`, {
    cookie: cookieOf(joined) + '; teacher_session=controlled-test-cookie', origin,
    auth: { sessionId: ids.session1, actorKind: 'teacher', permissions: ['session:watch', 'round:end'] },
  });
  try {
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    expect(await watchResponse(client)).toMatchObject({ event: 'session:state', payload: { phase: 'Waiting' } });
    expect(await watchResponse(client, ids.session2)).toMatchObject({ event: 'session:error', payload: { code: 'FORBIDDEN' } });
    expect(external).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  } finally {
    client.disconnect();
    await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
  }
});

it.each([
  ['valid Teacher adapter', 'teacher_session=controlled-test-cookie', origin, true, 'session:state'],
  ['missing Teacher Cookie', undefined, origin, true, 'session:error'],
  ['disallowed Origin', 'teacher_session=controlled-test-cookie', 'https://evil.example', true, 'session:error'],
  ['missing watch authorization', 'teacher_session=controlled-test-cookie', origin, false, 'session:error'],
] as const)('requires server-side Teacher adapters when no Student scope exists (%s)', async (_label, cookie, requestOrigin, allowWatch, expected) => {
  const f = studentFixture();
  const trusted = new WeakSet<object>();
  // Test adapter only: real signed Teacher Cookie / Origin / CSRF acceptance is still pending.
  const external = vi.fn((socket: StudentFoundationSocket): ActorContext | null => {
    if (socket.request.headers.cookie !== 'teacher_session=controlled-test-cookie' || socket.handshake.headers.origin !== origin) return null;
    const actor: ActorContext = { actorKind: 'teacher', actorId: 'controlled-teacher', permissions: ['session:watch'] };
    trusted.add(actor);
    return actor;
  });
  const authorize = vi.fn((actor: ActorContext, sessionId: typeof ids.session1) =>
    trusted.has(actor) && actor.actorKind === 'teacher' && actor.permissions.includes('session:watch')
      && Boolean(f.repositories.sessions.findById(sessionId)));
  const server = createHttpServer({ database: f.database, resolveSocketActorContext: external, authorizeWatch: allowWatch ? authorize : undefined });
  server.httpServer.listen(0, '127.0.0.1');
  await once(server.httpServer, 'listening');
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const client = await openClient(`http://127.0.0.1:${address.port}`, { cookie, origin: requestOrigin, auth: { actorKind: 'teacher', permissions: ['session:watch'] } });
  try {
    await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    expect((await watchResponse(client)).event).toBe(expected);
    expect(external).toHaveBeenCalledOnce();
    if (expected === 'session:error') {
      expect(server.socketServer.sockets.sockets.get(client.id!)?.rooms.has(sessionRoomName(ids.session1))).toBe(false);
    }
  } finally {
    client.disconnect();
    await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
  }
});
