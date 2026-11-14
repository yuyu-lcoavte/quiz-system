import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { studentFixture,cookieOf } from '../helpers/student.js';
import { createHttpServer } from '../../apps/server/src/app.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { io } from 'socket.io-client';
import { once } from 'node:events';
import { ids } from '../helpers/foundation.js';
import { LeaderFailoverService } from '../../apps/server/src/modules/student/application/leader-failover-service.js';
it('retains the original leader across independent restored requests',async()=>{
 const f=studentFixture(); const a=await f.join('Leader'); await f.join('Member');
 for(let i=0;i<2;i++){const r=await request(f.app).get(`${f.base}/me`).set('Cookie',cookieOf(a)); expect(r.body.data.isLeader).toBe(true); expect(r.body.data.participantId).toBe(a.body.data.participantId);}
});

it('keeps the offline assignment until an eligible member connects and retries safely after a rolled back write', async () => {
 const f = studentFixture();
 const leader = await f.join('Leader');
 const member = await f.join('Member');
 const scope = {sessionId: ids.session1, teamId: ids.team1};
 const leaders = createStudentRepositories(f.database).teamLeaders;
 const failover = new LeaderFailoverService(f.database);
 const leaderId = leader.body.data.participantId;
 const memberId = member.body.data.participantId;
 const memberOnline = () => new Set<typeof ids.participant1>([memberId]);
 expect(failover.reconcile(scope, memberOnline)).toBe(false);
 expect(failover.reconcile(scope, () => new Set(), leaderId)).toBe(false);
 expect(leaders.findByTeamId(ids.team1)?.participantId).toBe(leaderId);
 f.database.exec("CREATE TRIGGER fail_reassignment BEFORE UPDATE ON team_leaders BEGIN SELECT RAISE(ABORT, 'injected'); END");
 expect(() => failover.reconcile(scope, memberOnline)).toThrow();
 expect(leaders.findByTeamId(ids.team1)?.participantId).toBe(leaderId);
 f.database.exec('DROP TRIGGER fail_reassignment');
 expect(failover.reconcile(scope, memberOnline)).toBe(true);
 expect(failover.reconcile(scope, memberOnline, leaderId)).toBe(false);
 expect(leaders.findByTeamId(ids.team1)?.participantId).toBe(memberId);
});
it('retains leader membership after a real Socket disconnect when nobody can take over',async()=>{
 const f=studentFixture();const a=await f.join('Leader');const cookie=cookieOf(a);
 const identity=new StudentIdentityService(createStudentRepositories(f.database));
 const server=createHttpServer({database:f.database,studentSocket:{allowedOrigins:['http://127.0.0.1:5173'],resolveIdentity:(header,id)=>identity.resolve(header,id)}});
 server.httpServer.listen(0,'127.0.0.1');await once(server.httpServer,'listening');const address=server.httpServer.address();if(!address||typeof address==='string')throw Error('No port');
 try{for(let i=0;i<2;i++){
 const client=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Cookie:cookie,Origin:'http://127.0.0.1:5173'}});
 try{await new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);});}finally{client.disconnect();}
 const me=await request(f.app).get(`${f.base}/me`).set('Cookie',cookie);expect(me.body.data.isLeader).toBe(true);expect(me.body.data.participantId).toBe(a.body.data.participantId);
 }}finally{await new Promise<void>(resolve=>server.socketServer.close(()=>resolve()));}
});

it('waits for the final socket, skips an offline member, and restores the original Participant without the role', async () => {
 const f = studentFixture();
 const leader = await f.join('Leader');
 const revoked = await f.join('Revoked next');
 await f.join('Offline next');
 const successor = await f.join('Online next');
 const outsider = await f.join('Other team', ids.team2);
 const foreign = await request(f.app).post(`/api/v1/student/sessions/${ids.session2}/enrollments`)
   .set('Origin', 'http://127.0.0.1:5173').send({teamId:ids.teamOtherSession,displayName:'Other session'});
 const server = createHttpServer({database:f.database,studentSecurity:{secret:'test-secret-'.repeat(4),allowedOrigins:['http://127.0.0.1:5173']}});
 server.httpServer.listen(0, '127.0.0.1');
 await once(server.httpServer, 'listening');
 const address = server.httpServer.address();
 if (!address || typeof address === 'string') throw new Error('No test port');
 const url = `http://127.0.0.1:${address.port}`;
 const clients: ReturnType<typeof io>[] = [];
 async function connect(cookie: string, sessionId = ids.session1 as string) {
   const client = io(url, {autoConnect:false,reconnection:false,transports:['websocket'],auth:{sessionId},extraHeaders:{Cookie:cookie,Origin:'http://127.0.0.1:5173'}});
   clients.push(client);
   const ready = new Promise<void>((resolve,reject) => {client.once('connect',resolve);client.once('connect_error',reject);});
   client.connect();
   await ready;
   return client;
 }
 async function disconnect(client: ReturnType<typeof io>) {
   const socket = server.socketServer.sockets.sockets.get(client.id!)!;
   const closed = once(socket, 'disconnect');
   client.disconnect();
   await closed;
   return socket;
 }
 const me = (cookie: string) => request(f.app).get(`${f.base}/me`).set('Cookie', cookie);
 try {
   const first = await connect(cookieOf(leader));
   const second = await connect(cookieOf(leader));
   const invalidated = await connect(cookieOf(revoked));
   const staleIdentity = new StudentIdentityService(createStudentRepositories(f.database)).resolve(cookieOf(revoked), ids.session1)!;
   f.database.prepare('UPDATE student_browser_credentials SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), staleIdentity.credentialId);
   const next = await connect(cookieOf(successor));
   const other = await connect(cookieOf(outsider));
   const otherSession = await connect(cookieOf(foreign), ids.session2);
   const notices = vi.fn(); const leaked = vi.fn();
   next.on('student:membership:changed', notices);
   other.on('student:membership:changed', leaked); otherSession.on('student:membership:changed', leaked);
   invalidated.on('student:membership:changed', leaked);
   await disconnect(first);
   expect((await me(cookieOf(leader))).body.data.isLeader).toBe(true);
   expect(notices).not.toHaveBeenCalled();
   f.database.exec("CREATE TRIGGER reject_handoff BEFORE UPDATE ON team_leaders BEGIN SELECT RAISE(ABORT, 'injected'); END");
   const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
   try {
     await disconnect(second);
     expect(warning).toHaveBeenCalledWith('Student leader reconciliation failed.', 'SqliteError');
     expect((await me(cookieOf(leader))).body.data.isLeader).toBe(true);
     expect(notices).not.toHaveBeenCalled();
   } finally {
     warning.mockRestore();
     f.database.exec('DROP TRIGGER reject_handoff');
   }
   const denied = new Promise<unknown>(resolve => next.once('session:error', resolve));
   next.emit('session:watch', {sessionId:ids.session2});
   expect(await denied).toMatchObject({code:'FORBIDDEN'});
   expect(notices).not.toHaveBeenCalled();
   next.emit('session:watch', {sessionId:ids.session1});
   await vi.waitFor(() => expect(notices).toHaveBeenCalledExactlyOnceWith({sessionId:ids.session1,teamId:ids.team1}));
   expect((await me(cookieOf(successor))).body.data.isLeader).toBe(true);
   await connect(cookieOf(leader));
   expect((await me(cookieOf(leader))).body.data).toMatchObject({participantId:leader.body.data.participantId,isLeader:false});
   expect(leaked).not.toHaveBeenCalled();
   expect(f.database.prepare('SELECT count(*) AS count FROM team_leaders WHERE team_id = ?').get(ids.team1)).toEqual({count:1});
 } finally {
   clients.forEach(client => client.disconnect());
   await new Promise<void>(resolve => server.socketServer.close(() => resolve()));
 }
});
