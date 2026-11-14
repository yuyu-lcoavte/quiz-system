import { once } from 'node:events';
import { io as connectSocket, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
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
