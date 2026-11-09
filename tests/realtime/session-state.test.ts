import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import { createHttpServer } from '../../apps/server/src/app.js';
import { createFoundationRepositories } from '../../apps/server/src/persistence/repositories/index.js';
import { resolveMigrationsDirectory } from '../../apps/server/src/persistence/migrate.js';
import { ids, question, session, submission, team } from '../helpers/foundation.js';
import { createTestDatabase } from '../helpers/sqlite.js';
import type { TestDatabase } from '../helpers/sqlite.js';

const actor1: ActorContext = { actorKind: 'participant', actorId: ids.participant1, sessionId: ids.session1, teamId: ids.team1, permissions: ['session:watch'] };
const actor2: ActorContext = { actorKind: 'participant', actorId: 'actor-2', sessionId: ids.session2, teamId: ids.team2, permissions: ['session:watch'] };

function nextEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2_500);
    socket.once(event, (payload: T) => { clearTimeout(timer); resolveEvent(payload); });
  });
}

describe('Foundation session state synchronization', () => {
  let testDb: TestDatabase;
  let server: ReturnType<typeof createHttpServer>;
  let port: number;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    testDb = createTestDatabase();
    testDb.runMigrations(resolveMigrationsDirectory());
    const repositories = createFoundationRepositories(testDb.database);
    repositories.sessions.create(session());
    repositories.sessions.create(session(ids.session2));
    repositories.questions.create(question());
    repositories.questions.create(question(ids.question2));
    repositories.questions.create(question(ids.questionOtherSession, ids.session2));
    repositories.teams.create(team());
    repositories.teams.create(team(ids.team2, ids.session2));
    const actorByToken = new Map([['one', actor1], ['two', actor2]]);
    server = createHttpServer({
      database: testDb.database,
      resolveSocketActorContext: (socket) => actorByToken.get(String(socket.handshake.auth.token)) ?? null,
      authorizeWatch: (actor, sessionId) => actor.sessionId === sessionId && actor.permissions.includes('session:watch'),
    });
    await new Promise<void>((resolveListen) => server.httpServer.listen(0, '127.0.0.1', resolveListen));
    port = (server.httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await new Promise<void>((resolveClose) => server?.socketServer.close(() => resolveClose()));
  });

  async function connect(token: string, sessionId: UUID) {
    const socket = createClient(`http://127.0.0.1:${port}`, { auth: { token }, reconnection: false, timeout: 2500 });
    clients.push(socket);
    await nextEvent(socket, 'connect');
    const snapshotPromise = nextEvent<SessionStateSnapshot>(socket, 'session:state');
    socket.emit('session:watch', { sessionId });
    return { socket, initial: await snapshotPromise };
  }

  it('authorizes watches, returns reference-only latest snapshots, and isolates Session rooms', async () => {
    const one = await connect('one', ids.session1);
    const two = await connect('two', ids.session2);
    expect(one.initial).toMatchObject({ sessionId: ids.session1, phase: 'Waiting', currentRoundId: null, target: null });
    expect(JSON.stringify(one.initial)).not.toContain('Question 20');
    const twoChanges = nextEvent<SessionStateSnapshot>(two.socket, 'session:state:changed');
    const changed = nextEvent<SessionStateSnapshot>(one.socket, 'session:state:changed');
    const snapshot = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 0);
    expect((await changed).stateVersion).toBe(snapshot.stateVersion);
    await expect(Promise.race([twoChanges, new Promise((resolveWait) => setTimeout(() => resolveWait('none'), 150))])).resolves.toBe('none');
  });

  it('broadcasts post-commit Waiting → Active → Ended snapshots to both authorized clients within two seconds', async () => {
    const first = await connect('one', ids.session1);
    const second = await connect('one', ids.session1);
    const changedFirst = nextEvent<SessionStateSnapshot>(first.socket, 'session:state:changed');
    const changedSecond = nextEvent<SessionStateSnapshot>(second.socket, 'session:state:changed');
    const waiting = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 0);
    const selectStartedAt = performance.now();
    const [waitA, waitB] = await Promise.all([changedFirst, changedSecond]);
    expect(waitA).toEqual(waitB);
    expect(waitA.phase).toBe('Waiting');
    expect(performance.now() - selectStartedAt).toBeLessThan(2000);
    expect(waiting.currentRoundId).not.toBeNull();

    const activeA = nextEvent<SessionStateSnapshot>(first.socket, 'session:state:changed');
    const activeB = nextEvent<SessionStateSnapshot>(second.socket, 'session:state:changed');
    const startedAt = performance.now();
    server.sessionLifecycle!.startRound(ids.session1, waiting.stateVersion);
    const [active1, active2] = await Promise.all([activeA, activeB]);
    expect(active1).toEqual(active2);
    expect(active1.phase).toBe('Active');
    expect(performance.now() - startedAt).toBeLessThan(2000);

    const endedA = nextEvent<SessionStateSnapshot>(first.socket, 'session:state:changed');
    const endedB = nextEvent<SessionStateSnapshot>(second.socket, 'session:state:changed');
    const roundId = active1.currentRoundId!;
    const repositories = createFoundationRepositories(testDb.database);
    repositories.submissions.create(submission(ids.submission1, ids.team1, roundId, 1));
    let resultVisibleAtBroadcast = false;
    first.socket.once('session:state:changed', (snapshot: SessionStateSnapshot) => {
      if (snapshot.phase === 'Ended') resultVisibleAtBroadcast = repositories.results.findByRound(roundId) !== null;
    });
    const startedEndAt = performance.now();
    const ended = server.sessionLifecycle!.endRound(ids.session1, active1.stateVersion, {
      id: ids.result1, roundId, winningSubmissionId: ids.submission1, createdAt: new Date().toISOString(),
    });
    const [end1, end2] = await Promise.all([endedA, endedB]);
    expect(end1).toEqual(end2);
    expect(end1.phase).toBe('Ended');
    expect(resultVisibleAtBroadcast).toBe(true);
    expect(performance.now() - startedEndAt).toBeLessThan(2000);
    expect(ended.stateVersion).toBe(active1.stateVersion + 1);
  });

  it('reconciles the latest snapshot after reconnect and rejects unauthorized watches', async () => {
    const { socket } = await connect('one', ids.session1);
    const waiting = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 0);
    server.sessionLifecycle!.startRound(ids.session1, waiting.stateVersion);
    socket.disconnect();
    socket.connect();
    await nextEvent(socket, 'connect');
    const refreshed = nextEvent<SessionStateSnapshot>(socket, 'session:state');
    socket.emit('session:watch', { sessionId: ids.session1 });
    expect(await refreshed).toMatchObject({ phase: 'Active', currentRoundId: waiting.currentRoundId, stateVersion: waiting.stateVersion + 1 });

    const unauthenticated = createClient(`http://127.0.0.1:${port}`, { reconnection: false, timeout: 2500 });
    clients.push(unauthenticated);
    await nextEvent(unauthenticated, 'connect');
    const error = nextEvent<{ code: string }>(unauthenticated, 'session:error');
    unauthenticated.emit('session:watch', { sessionId: ids.session1 });
    expect(await error).toMatchObject({ code: 'UNAUTHENTICATED' });
    const unauthServerSocket = unauthenticated.id ? server.socketServer.sockets.sockets.get(unauthenticated.id) : undefined;
    expect(unauthServerSocket?.rooms.has(`session:${ids.session1}`)).toBe(false);
  });

  it('ignores repeated or stale publishes and a no-winner End leaves no result', async () => {
    const { socket } = await connect('one', ids.session1);
    const waiting = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 0);
    const active = server.sessionLifecycle!.startRound(ids.session1, waiting.stateVersion);
    const ended = server.sessionLifecycle!.endRound(ids.session1, active.stateVersion);
    expect(createFoundationRepositories(testDb.database).results.listByTarget(ids.session1, { kind: 'question', questionId: ids.question1 })).toEqual([]);
    expect(server.statePublisher.publish(ended)).toBe(false);
    expect(server.statePublisher.publish(active)).toBe(false);
    expect(socket.connected).toBe(true);
  });

  it('creates a distinct Waiting Round for next and reopened targets and rejects invalid transitions', () => {
    expect(() => server.sessionLifecycle!.startRound(ids.session1, 0)).toThrow();
    const first = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 0);
    expect(first.phase).toBe('Waiting');
    const active = server.sessionLifecycle!.startRound(ids.session1, first.stateVersion);
    expect(() => server.sessionLifecycle!.startRound(ids.session1, active.stateVersion)).toThrow();
    const ended = server.sessionLifecycle!.endRound(ids.session1, active.stateVersion);
    const next = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question2 }, ended.stateVersion);
    expect(next.phase).toBe('Waiting');
    expect(next.currentRoundId).not.toBe(first.currentRoundId);
    const nextActive = server.sessionLifecycle!.startRound(ids.session1, next.stateVersion);
    const nextEnded = server.sessionLifecycle!.endRound(ids.session1, nextActive.stateVersion);
    const reopened = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question2 }, nextEnded.stateVersion);
    expect(reopened.phase).toBe('Waiting');
    expect(reopened.currentRoundId).not.toBe(next.currentRoundId);
    expect(reopened.stateVersion).toBe(nextEnded.stateVersion + 1);
  });

  it('replaces a previous logical-target Result, and removes it when the reopened Round has no winner', () => {
    const repositories = createFoundationRepositories(testDb.database);
    const waiting = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, 0);
    const active = server.sessionLifecycle!.startRound(ids.session1, waiting.stateVersion);
    repositories.submissions.create(submission(ids.submission1, ids.team1, active.currentRoundId!, 1));
    const ended = server.sessionLifecycle!.endRound(ids.session1, active.stateVersion, {
      id: ids.result1, roundId: active.currentRoundId!, winningSubmissionId: ids.submission1, createdAt: new Date().toISOString(),
    });
    expect(repositories.results.listByTarget(ids.session1, { kind: 'question', questionId: ids.question1 })).toHaveLength(1);
    const reopened = server.sessionLifecycle!.selectTarget(ids.session1, { kind: 'question', questionId: ids.question1 }, ended.stateVersion);
    const reopenedActive = server.sessionLifecycle!.startRound(ids.session1, reopened.stateVersion);
    server.sessionLifecycle!.endRound(ids.session1, reopenedActive.stateVersion);
    expect(repositories.results.listByTarget(ids.session1, { kind: 'question', questionId: ids.question1 })).toEqual([]);
  });
});
