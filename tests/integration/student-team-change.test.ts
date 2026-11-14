import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { createApp, createHttpServer } from '../../apps/server/src/app.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { LeaderFailoverService } from '../../apps/server/src/modules/student/application/leader-failover-service.js';
import { studentFixture,cookieOf } from '../helpers/student.js';
import { ids,question,round } from '../helpers/foundation.js';
const origin = 'http://127.0.0.1:5173';
const studentSecurity = {secret:'test-secret-'.repeat(4),allowedOrigins:[origin]};

it.each([true,false])('persists an all-offline handoff and rechecks on arrival (temporary leader arrives first: %s)', async temporaryFirst => {
 const f = studentFixture();
 const a = await f.join('A');
 const b = await f.join('B');
 const c = await f.join('C');
 const post = () => request(f.app).post(`${f.base}/team-change`).set('Cookie',cookieOf(a))
  .set('Origin',origin).set('X-CSRF-Token',a.body.data.csrfToken);
 expect((await post().send({targetTeamId:ids.team2,successorParticipantId:c.body.data.participantId})).status).toBe(400);
 expect((await post().send({targetTeamId:ids.team2})).status).toBe(200);
 const leaders = createStudentRepositories(f.database).teamLeaders;
 expect(leaders.findByTeamId(ids.team1)?.participantId).toBe(b.body.data.participantId);
 expect(leaders.needsOnlineRecheck(ids.team1)).toBe(true);
 const arriving = (temporaryFirst ? b : c).body.data.participantId;
 // Fresh service instance: the flag must survive loss of in-memory presence.
 const failover = new LeaderFailoverService(f.database);
 expect(failover.reconcile({sessionId:ids.session1,teamId:ids.team1}, () => new Set([arriving]))).toBe(!temporaryFirst);
 expect(leaders.findByTeamId(ids.team1)?.participantId).toBe(arriving);
 expect(leaders.needsOnlineRecheck(ids.team1)).toBe(false);
});

it('serializes overlapping moves and assigns exactly one destination leader', async () => {
 const f = studentFixture();
 const a = await f.join('A');
 const b = await f.join('B');
 const move = (student: typeof a) => request(f.app).post(`${f.base}/team-change`).set('Cookie',cookieOf(student))
  .set('Origin',origin).set('X-CSRF-Token',student.body.data.csrfToken).send({targetTeamId:ids.team2});
 const responses = await Promise.all([move(a),move(b),move(a)]);
 expect(responses.map(result=>result.status).sort()).toEqual([200,200,400]);
 const leaders = createStudentRepositories(f.database).teamLeaders;
 expect(leaders.findByTeamId(ids.team1)).toBeNull();
 expect(leaders.findByTeamId(ids.team2)?.participantId)
  .toBe(responses.find(result=>result.status===200 && result.body.data.isLeader)?.body.data.participantId);
 expect(leaders.needsOnlineRecheck(ids.team2)).toBe(false);
});

it.each([false, true])('moves a sole leader and lets a new student lead the vacant source (destination occupied: %s)', async occupied => {
 const f = studentFixture();
 const a = await f.join('A');
 const existing = occupied ? await f.join('Destination leader', ids.team2) : null;
 const leader = createStudentRepositories(f.database).teamLeaders;
 const move = await request(f.app).post(`${f.base}/team-change`).set('Cookie',cookieOf(a))
  .set('Origin',origin).set('X-CSRF-Token',a.body.data.csrfToken).send({targetTeamId:ids.team2});
 expect(move.status).toBe(200);
 expect(move.body.data).toMatchObject({participantId:a.body.data.participantId,team:{teamId:ids.team2},isLeader:!occupied});
 expect(leader.findByTeamId(ids.team2)?.participantId).toBe((existing ?? a).body.data.participantId);
 expect(leader.findByTeamId(ids.team1)).toBeNull();
 expect(f.repositories.teams.listBySession(ids.session1).some(team => team.id === ids.team1)).toBe(true);
 expect(f.database.prepare('SELECT COUNT(*) AS count FROM participants WHERE team_id=?').get(ids.team1)).toEqual({count:0});
 const next = await f.join('New source member');
 expect(next.body.data.isLeader).toBe(true);
 expect(leader.findByTeamId(ids.team1)?.participantId).toBe(next.body.data.participantId);
 const me = await request(f.app).get(`${f.base}/me`).set('Cookie',cookieOf(a));
 expect(me.body.data).toMatchObject({participantId:a.body.data.participantId,team:{teamId:ids.team2},isLeader:!occupied});
});

it.each([false,true])('rolls back leadership and does not publish when the move fails (source has teammate: %s)', async hasTeammate => {
 const f = studentFixture();
 const a = await f.join('A');
 if (hasTeammate) await f.join('Offline teammate');
 const publishStudentMembership = vi.fn();
 const app = createApp({database:f.database,studentSecurity,publishStudentMembership});
 f.database.exec("CREATE TRIGGER fail_move BEFORE UPDATE OF team_id ON participants BEGIN SELECT RAISE(ABORT,'injected'); END;");
 const move = await request(app).post(`${f.base}/team-change`).set('Cookie',cookieOf(a))
  .set('Origin',origin).set('X-CSRF-Token',a.body.data.csrfToken).send({targetTeamId:ids.team2});
 expect(move.status).toBe(500);
 expect(publishStudentMembership).not.toHaveBeenCalled();
 const leader = createStudentRepositories(f.database).teamLeaders;
 expect(leader.findByTeamId(ids.team1)?.participantId).toBe(a.body.data.participantId);
 expect(leader.needsOnlineRecheck(ids.team1)).toBe(false);
 expect(leader.findByTeamId(ids.team2)).toBeNull();
 expect(f.repositories.participants.findById(a.body.data.participantId)?.teamId).toBe(ids.team1);
});

it('hands off to an online teammate and notifies them after the new assignment is readable', async () => {
 const f = studentFixture();
 const a = await f.join('A');
 const earlier = await f.join('Earlier offline teammate');
 const b = await f.join('First online teammate');
 const c = await f.join('Second online teammate');
 const server = createHttpServer({database:f.database,studentSecurity});
 server.httpServer.listen(0,'127.0.0.1');
 await once(server.httpServer,'listening');
 const address = server.httpServer.address();
 if (!address || typeof address === 'string') throw new Error('No test port');
 const connectClient = (cookie: string) => io(`http://127.0.0.1:${address.port}`, {autoConnect:false, reconnection:false, transports:['websocket'],
  auth:{sessionId:ids.session1}, extraHeaders:{Cookie:cookie,Origin:origin}});
 const client = connectClient(cookieOf(b));
 const other = connectClient(cookieOf(c));
 try {
  for (const socket of [other, client]) {
   const connected = new Promise<void>((resolve,reject) => {socket.once('connect',resolve);socket.once('connect_error',reject);});
   socket.connect();
   await connected;
  }
  const notifications = vi.fn(() => createStudentRepositories(f.database).teamLeaders.findByTeamId(ids.team1)?.participantId);
  client.on('student:membership:changed', notifications);
  const move = () => request(server.app).post(`${f.base}/team-change`).set('Cookie',cookieOf(a))
   .set('Origin',origin).set('X-CSRF-Token',a.body.data.csrfToken).send({targetTeamId:ids.team2});
  expect((await move()).status).toBe(200);
  await vi.waitFor(() => expect(notifications).toHaveBeenCalledExactlyOnceWith({sessionId:ids.session1,teamId:ids.team1}));
  expect(notifications).toHaveReturnedWith(b.body.data.participantId);
  expect(notifications).not.toHaveReturnedWith(earlier.body.data.participantId);
 } finally {
  client.disconnect(); other.disconnect();
  await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
 }
});
it('rejects stale move options during Active and a later Waiting Round and still requires Origin and CSRF', async () => {
 const f = studentFixture();
 await f.join('A');
 const b = await f.join('B');
 const post = () => request(f.app).post(`${f.base}/team-change`).set('Cookie', cookieOf(b))
  .send({targetTeamId:ids.team2});
 const move = () => post().set('Origin', 'http://127.0.0.1:5173').set('X-CSRF-Token', b.body.data.csrfToken);
 const me = () => request(f.app).get(`${f.base}/me`).set('Cookie', cookieOf(b));
 expect((await post()).status).toBe(403);
 expect((await post().set('Origin', 'http://127.0.0.1:5173')).status).toBe(403);
 f.repositories.questions.create(question());
 f.repositories.rounds.create({...round(), phase:'Active', startedAt:new Date().toISOString()});
 expect((await me()).body.data.teamChange).toBeNull();
 expect((await move()).body.error.code).toBe('INVALID_PHASE');
 f.database.prepare("UPDATE rounds SET phase='Ended', ended_at=? WHERE id=?").run(new Date().toISOString(), ids.round1);
 f.repositories.rounds.create({...round(), id:ids.round2});
 f.database.prepare("UPDATE sessions SET current_round_id=? WHERE id=?").run(ids.round2, ids.session1);
 expect((await me()).body.data.teamChange).toBeNull();
 expect((await move()).body.error.code).toBe('INVALID_PHASE');
 expect((await me()).body.data.team.teamId).toBe(ids.team1);
});
