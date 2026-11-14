import { it, expect } from 'vitest';
import { createStudentSessionState } from '../../apps/web/src/modules/student/student-session-state.js';
import { ids, TIME } from '../helpers/foundation.js';
import { round } from '../helpers/foundation.js';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { createHttpServer } from '../../apps/server/src/app.js';
import { SessionStateService } from '../../apps/server/src/modules/sessions/application/session-state-service.js';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import request from 'supertest';
import type { SessionStateSnapshot } from '@quiz/contracts/domain';

it('reuses Foundation state versions, rejects other Sessions, and resubscribes after reconnect', () => {
  const callbacks = new Map<string, Function>(); let watches = 0;
  const socket = { connected: false, on: (name: string, callback: Function) => callbacks.set(name, callback), off: (name: string) => callbacks.delete(name), emit: () => { watches++; } };
  const client = createStudentSessionState(ids.session1, { socket: socket as never });
  let displayed = -1; client.subscribe(snapshot => { displayed = snapshot.stateVersion; });
  const waiting = { sessionId: ids.session1, currentRoundId: null, target: null, phase: 'Waiting', stateVersion: 0, changedAt: TIME };
  callbacks.get('session:state')!(waiting); expect(client.getSnapshot()?.phase).toBe('Waiting');
  const active = { ...waiting, phase: 'Active', currentRoundId: ids.round1, target: { kind: 'question', questionId: ids.question1 }, stateVersion: 2 };
  callbacks.get('session:state:changed')!(active); callbacks.get('session:state:changed')!({ ...waiting, stateVersion: 1 });
  callbacks.get('session:state:changed')!({ ...active, sessionId: ids.session2, stateVersion: 99 }); expect(displayed).toBe(2);
  callbacks.get('connect')!(); expect(watches).toBe(1);
  callbacks.get('session:state')!({ ...active, phase: 'Ended', stateVersion: 3, answers: ['must not survive parsing'] });
  expect(client.getSnapshot()?.phase).toBe('Ended'); expect(client.getSnapshot()).not.toHaveProperty('answers');
  callbacks.get('session:state:changed')!({ ...active, currentRoundId: ids.round2, phase: 'Waiting', stateVersion: 4 });
  expect(client.getSnapshot()?.currentRoundId).toBe(ids.round2); client.dispose(); expect(callbacks.size).toBe(0);
});

it('receives Cookie-authorized real state changes within two seconds and restores the new Round on reconnect', async () => {
  const f = await draftFixture();
  // Trusted fixture state only; this does not exercise or implement the deferred Teacher End integration.
  f.database.prepare("UPDATE rounds SET phase='Waiting' WHERE id=?").run(ids.round1);
  const server = createHttpServer({ database: f.database, studentSecurity: { secret: 'test-secret-'.repeat(4), allowedOrigins: ['http://127.0.0.1:5173'] } });
  server.httpServer.listen(0, '127.0.0.1'); await once(server.httpServer, 'listening');
  const address = server.httpServer.address(); if (!address || typeof address === 'string') throw Error('No test port.');
  const socket = io(`http://127.0.0.1:${address.port}`, { autoConnect: false, transports: ['websocket'], reconnection: false, auth: { sessionId: ids.session1 }, extraHeaders: { Cookie: cookieOf(f.a), Origin: 'http://127.0.0.1:5173' } });
  const client = createStudentSessionState(ids.session1, { socket });
  const nextState = (accept: (state: SessionStateSnapshot) => boolean) => new Promise<SessionStateSnapshot>((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => { unsubscribe(); reject(Error('Timed out waiting for Student state.')); }, 2500);
    unsubscribe = client.subscribe(state => { if (accept(state)) { clearTimeout(timer); unsubscribe(); resolve(state); } });
  });
  try {
    const initial = nextState(state => state.phase === 'Waiting'); socket.connect(); expect((await initial).currentRoundId).toBe(ids.round1);
    expect((await request(f.app).get(`/api/v1/sessions/${ids.session1}/state`).set('Cookie', cookieOf(f.a))).body.data.phase).toBe('Waiting');
    for (const phase of ['Active', 'Ended'] as const) {
      const received = nextState(state => state.phase === phase); const start = Date.now();
      f.database.prepare('UPDATE rounds SET phase=?, started_at=?, ended_at=? WHERE id=?').run(phase, TIME, phase === 'Ended' ? TIME : null, ids.round1);
      f.database.prepare('UPDATE sessions SET state_version=state_version+1 WHERE id=?').run(ids.session1);
      server.statePublisher.publish(new SessionStateService(f.database).getSnapshot(ids.session1)!);
      const state = await received; expect(Date.now() - start).toBeLessThan(2000); expect(state).not.toHaveProperty('answers'); expect(state).not.toHaveProperty('prompt');
    }
    socket.disconnect();
    f.repositories.rounds.create(round(ids.round2)); f.database.prepare('UPDATE sessions SET current_round_id=?, state_version=state_version+1 WHERE id=?').run(ids.round2, ids.session1);
    const restored = nextState(state => state.currentRoundId === ids.round2); socket.connect(); expect((await restored).phase).toBe('Waiting');
    const denied = new Promise<{ code: string }>(resolve => socket.once('session:error', resolve)); socket.emit('session:watch', { sessionId: ids.session2 });
    expect((await denied).code).toBe('FORBIDDEN');
  } finally { client.dispose(); socket.disconnect(); await new Promise<void>(resolve => server.socketServer.close(() => resolve())); }
});
