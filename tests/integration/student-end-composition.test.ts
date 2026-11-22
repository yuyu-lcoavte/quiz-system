import { once } from 'node:events';
import { createServer } from 'node:net';
import { Router } from 'express';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import type { ActorContext } from '@quiz/contracts/identity';
import type { SessionStateSnapshot } from '@quiz/contracts/domain';
import { createHttpServer, startServer, type TeacherServiceDependencies } from '../../apps/server/src/app.js';
import { StudentWinnerResolver } from '../../apps/server/src/modules/student/application/winner-resolver.js';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { ids } from '../helpers/foundation.js';

const origin = 'http://127.0.0.1:5173';
const studentSecurity = { secret: 'test-secret-'.repeat(4), allowedOrigins: [origin] };
const teacher: ActorContext = { actorKind: 'teacher', actorId: 'controlled-test-teacher', sessionId: ids.session1, permissions: ['round:end'] };
const input = { sessionId: ids.session1, roundId: ids.round1, expectedStateVersion: 0, requestId: 'controlled-server-request' };

function event<T>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 2500);
    socket.once(name, value => { clearTimeout(timer); resolve(value); });
  });
}

it('composes one Coordinator, lifecycle and shared Database before invoking the Teacher router factory', async () => {
  const f = await draftFixture();
  let injected: TeacherServiceDependencies | undefined;
  // This is a test-only router adapter. It issues no Teacher identity or End endpoint.
  const factory = vi.fn((services: TeacherServiceDependencies) => {
    injected = services;
    const router = Router();
    router.get('/services-ready', (_req, res) => res.json({ data: { ready: Boolean(services.endCoordinator && services.sessionLifecycle) } }));
    return router;
  });
  const server = createHttpServer({ database: f.database, studentSecurity, createTeacherRouter: factory });
  try {
    expect(factory).toHaveBeenCalledOnce();
    expect(injected?.database).toBe(f.database);
    expect(injected?.sessionLifecycle).toBe(server.sessionLifecycle);
    expect(injected?.endCoordinator).toBe(server.endCoordinator);
    expect((await request(server.app).get('/api/v1/teacher/services-ready')).body.data).toEqual({ ready: true });
    const delegate = vi.spyOn(server.sessionLifecycle!, 'endRoundWithWinnerResolver');
    expect(server.endCoordinator!.endRound(input, teacher)).toMatchObject({ phase: 'Ended', stateVersion: 1 });
    expect(delegate).toHaveBeenCalledExactlyOnceWith(input, expect.any(Function));
    expect(f.database.inTransaction).toBe(false);
  } finally {
    await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
  }
});

it('composed End reads submissions on the same transaction connection and broadcasts committed state', async () => {
  const f = await draftFixture();
  await f.edit('one');
  await f.edit('two', ids.blank2);
  const server = createHttpServer({ database: f.database, studentSecurity });
  const observer = new DatabaseManager({ sqlitePath: f.database.name });
  const resolveWinner = StudentWinnerResolver.prototype.resolveWinnerInTransaction;
  const resolver = vi.spyOn(StudentWinnerResolver.prototype, 'resolveWinnerInTransaction')
    .mockImplementation(function (this: StudentWinnerResolver, roundId) {
      expect(f.database.inTransaction).toBe(true);
      return resolveWinner.call(this, roundId);
    });
  let client: Socket | undefined;
  try {
    const accepted = await request(server.app).post(`${f.base}/rounds/${ids.round1}/submissions`)
      .set('Cookie', cookieOf(f.a)).set('Origin', origin).set('X-CSRF-Token', f.a.body.data.csrfToken)
      .send({ answers: [{ blankId: ids.blank1, value: 'one' }, { blankId: ids.blank2, value: 'two' }] });
    expect(accepted.status).toBe(200);
    server.httpServer.listen(0, '127.0.0.1');
    await once(server.httpServer, 'listening');
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    client = io(`http://127.0.0.1:${address.port}`, { autoConnect: false, reconnection: false, transports: ['websocket'],
      auth: { sessionId: ids.session1 }, extraHeaders: { Cookie: cookieOf(f.a), Origin: origin } });
    const connected = event(client, 'connect');
    client.connect();
    await connected;
    const initial = event<SessionStateSnapshot>(client, 'session:state');
    client.emit('session:watch', { sessionId: ids.session1 });
    expect((await initial).phase).toBe('Active');
    const publish = server.statePublisher.publish.bind(server.statePublisher);
    const read = observer.open().prepare('SELECT phase, winning_submission_id FROM rounds JOIN results ON results.round_id=rounds.id WHERE rounds.id=?');
    const notification = vi.spyOn(server.statePublisher, 'publish').mockImplementation(snapshot => {
      expect(f.database.inTransaction).toBe(false);
      expect(read.get(ids.round1)).toEqual({ phase: 'Ended', winning_submission_id: accepted.body.data.submissionId });
      return publish(snapshot);
    });
    const changed = event<SessionStateSnapshot>(client, 'session:state:changed');
    const snapshot = server.endCoordinator!.endRound(input, teacher);
    expect(await changed).toEqual(snapshot);
    expect(resolver).toHaveBeenCalledExactlyOnceWith(ids.round1);
    expect(notification).toHaveBeenCalledExactlyOnceWith(snapshot);
    const projected = await request(server.app).get(`${f.base}/rounds/${ids.round1}/result`).set('Cookie', cookieOf(f.a));
    expect(projected.body.data.winner.teamId).toBe(ids.team1);
    expect(() => server.endCoordinator!.endRound(input, teacher)).toThrow(expect.objectContaining({ status: 409 }));
    expect(notification).toHaveBeenCalledTimes(1);
  } finally {
    client?.disconnect();
    resolver.mockRestore();
    observer.close();
    await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
  }
});

it('keeps Teacher endpoints unavailable without a supplied router adapter', async () => {
  const f = await draftFixture();
  const server = createHttpServer({ database: f.database, studentSecurity });
  try {
    expect(server.endCoordinator).toBeDefined();
    expect((await request(server.app).get('/api/v1/teacher/services-ready')).status).toBe(404);
    expect(() => server.endCoordinator!.endRound(input, null)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => server.endCoordinator!.endRound(input, { ...teacher, permissions: [] }))
      .toThrow(expect.objectContaining({ status: 403 }));
    expect(f.repositories.rounds.findById(ids.round1)?.phase).toBe('Active');
  } finally {
    await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
  }
});

it('rejects router composition without a shared Database before calling the factory', () => {
  const factory = vi.fn(() => Router());
  expect(() => createHttpServer({ createTeacherRouter: factory })).toThrow(/shared Database/);
  expect(factory).not.toHaveBeenCalled();
});

it('forwards supplied Teacher adapters through startServer and closes its one managed Database', async () => {
  const f = await draftFixture();
  const portReservation = createServer();
  portReservation.listen(0, '127.0.0.1');
  await once(portReservation, 'listening');
  const address = portReservation.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  await new Promise<void>(resolve => portReservation.close(() => resolve()));
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SQLITE_PATH', f.database.name);
  vi.stubEnv('PORT', String(address.port));
  vi.stubEnv('STUDENT_CSRF_SECRET', studentSecurity.secret);
  vi.stubEnv('STUDENT_ALLOWED_ORIGINS', origin);
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const open = vi.spyOn(DatabaseManager.prototype, 'open');
  const external = vi.fn((): ActorContext => ({ ...teacher, sessionId: undefined, permissions: ['session:watch'] }));
  const authorize = vi.fn(() => true);
  const httpActor = vi.fn(() => null);
  let services: TeacherServiceDependencies | undefined;
  let http: ReturnType<typeof startServer> | undefined;
  let client: Socket | undefined;
  try {
    http = startServer({
      resolveActorContext: httpActor,
      resolveSocketActorContext: external,
      authorizeWatch: authorize,
      createTeacherRouter: dependencies => {
        services = dependencies;
        const router = Router();
        router.get('/services-ready', (_req, res) => res.json({ data: { ready: true } }));
        return router;
      },
    });
    await once(http, 'listening');
    expect(open).toHaveBeenCalledOnce();
    expect(services?.database.name).toBe(f.database.name);
    expect((await request(http).get('/api/v1/teacher/services-ready')).body.data.ready).toBe(true);
    expect(httpActor).toHaveBeenCalled();
    client = io(`http://127.0.0.1:${address.port}`, {
      autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { Origin: origin },
    });
    const connected = event(client, 'connect');
    client.connect();
    await connected;
    const state = event<SessionStateSnapshot>(client, 'session:state');
    client.emit('session:watch', { sessionId: ids.session1 });
    expect((await state).phase).toBe('Active');
    expect(external).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ actorKind: 'teacher' }), ids.session1);
  } finally {
    client?.disconnect();
    if (http) {
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) => http!.close(error => error ? reject(error) : resolve()));
    }
    open.mockRestore();
    info.mockRestore();
    vi.unstubAllEnvs();
  }
  expect(services?.database.open).toBe(false);
});
