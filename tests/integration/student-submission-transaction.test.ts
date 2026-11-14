import request from 'supertest';
import { it,expect } from 'vitest';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { ids,round } from '../helpers/foundation.js';
import { SubmissionService } from '../../apps/server/src/modules/student/application/submission-service.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { createHttpServer } from '../../apps/server/src/app.js';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { StudentWinnerResolver } from '../../apps/server/src/modules/student/application/winner-resolver.js';
import { LeaderFailoverService } from '../../apps/server/src/modules/student/application/leader-failover-service.js';

it.each([true, false])('serializes submission and failover (submission first: %s)', async (submissionFirst) => {
  const f = await draftFixture();
  expect((await f.edit('one')).status).toBe(200);
  expect((await f.edit('two', ids.blank2)).status).toBe(200);
  const identity = new StudentIdentityService(createStudentRepositories(f.database));
  const previous = identity.resolve(cookieOf(f.a), ids.session1)!.actorContext;
  const successor = identity.resolve(cookieOf(f.b), ids.session1)!.actorContext;
  const service = new SubmissionService(f.database);
  const failover = new LeaderFailoverService(f.database);
  const answers = [{ blankId: ids.blank1, value: 'one' }, { blankId: ids.blank2, value: 'two' }];
  const submit = (actor: typeof previous) => service.submit(actor, ids.session1, ids.round1, answers);
  const accepted = submissionFirst ? submit(previous) : null;
  expect(failover.reconcile({sessionId:ids.session1,teamId:ids.team1}, () => new Set([f.b.body.data.participantId]), f.a.body.data.participantId)).toBe(true);
  expect(() => submit(previous)).toThrow(expect.objectContaining({code:'FORBIDDEN'}));
  if (accepted) {
    expect(() => submit(successor)).toThrow(expect.objectContaining({code:'DUPLICATE_SUBMISSION'}));
    expect(f.repositories.submissionAnswers.listBySubmission(accepted.submissionId)).toMatchObject(answers);
  } else {
    expect(submit(successor)).toMatchObject({acceptedOrder:1,draftStatus:'locked'});
  }
  expect(f.database.prepare('SELECT count(*) AS count FROM submissions').get()).toEqual({count:1});
});

it('preserves the draft when another SQLite connection holds the writer lock, then exposes the committed submission to the resolver', async () => {
  const f = await draftFixture();
  expect((await f.edit('one')).status).toBe(200);
  expect((await f.edit('two', ids.blank2)).status).toBe(200);
  const student = createStudentRepositories(f.database);
  const actor = new StudentIdentityService(student).resolve(cookieOf(f.a), ids.session1)!.actorContext;
  const answers = [{ blankId: ids.blank1, value: 'one' }, { blankId: ids.blank2, value: 'two' }];
  const writer = new DatabaseManager({ sqlitePath: f.database.name, timeoutMs: 0 });
  const submitConnection = writer.open();
  let notifications = 0;
  const service = new SubmissionService(submitConnection, () => { notifications++; });
  const resolveWinner = new StudentWinnerResolver(f.database);
  const readWinner = f.database.transaction(() => resolveWinner.resolveWinnerInTransaction(ids.round1));

  try {
    f.database.transaction(() => {
      expect(resolveWinner.resolveWinnerInTransaction(ids.round1)).toBeNull();
      expect(() => service.submit(actor, ids.session1, ids.round1, answers)).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
      expect(student.drafts.find(ids.team1, ids.round1)?.status).toBe('editable');
    }).immediate();
    expect(notifications).toBe(0);
    expect(readWinner.immediate()).toBeNull();

    const committed = service.submit(actor, ids.session1, ids.round1, answers);
    expect(committed.acceptedOrder).toBe(1);
    expect(notifications).toBe(1);
    expect(student.drafts.find(ids.team1, ids.round1)?.status).toBe('locked');
    expect(readWinner.immediate()?.winningSubmissionId).toBe(committed.submissionId);
    expect(f.repositories.results.findByRound(ids.round1)).toBeNull();
  } finally {
    writer.close();
  }
});
it('serializes two Teams and duplicate requests with unique accepted order',async()=>{
 const f=await draftFixture();await f.edit('one');await f.edit('two',ids.blank2);
 const answers=[{blankId:ids.blank1,value:'one'},{blankId:ids.blank2,value:'two'}];
 for(const a of answers)await request(f.app).put(`${f.path}/answers/${a.blankId}`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.other)).set('X-CSRF-Token',f.other.body.data.csrfToken).send({value:a.value,baseVersion:0,clientMutationId:crypto.randomUUID()});
 const submit=(member:typeof f.a)=>request(f.app).post(`${f.base}/rounds/${ids.round1}/submissions`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(member)).set('X-CSRF-Token',member.body.data.csrfToken).send({answers});
 const results=await Promise.all([submit(f.a),submit(f.other),submit(f.a)]);expect(results.map(r=>r.status).sort()).toEqual([200,200,409]);
 expect(results.filter(r=>r.status===200).map(r=>r.body.data.acceptedOrder).sort()).toEqual([1,2]);
 expect(f.database.prepare('SELECT count(*) n FROM submissions').get()).toEqual({n:2});
});
it('rolls back answers, order and lock on failure, and publishes only after commit',async()=>{
 const f=await draftFixture();await f.edit('one');await f.edit('two',ids.blank2);
 const actor=new StudentIdentityService(createStudentRepositories(f.database)).resolve(cookieOf(f.a),ids.session1)!.actorContext;
 const answers=[{blankId:ids.blank1,value:'one'},{blankId:ids.blank2,value:'two'}];let published=0;
 const service=new SubmissionService(f.database,()=>{expect(f.database.inTransaction).toBe(false);expect(f.database.prepare('SELECT count(*) n FROM submissions').get()).toEqual({n:1});published++;});
 f.database.exec("CREATE TRIGGER fail_answer BEFORE INSERT ON submission_answers BEGIN SELECT RAISE(ABORT,'injected'); END;");
 expect(()=>service.submit(actor,ids.session1,ids.round1,answers)).toThrow();expect(f.database.prepare('SELECT count(*) n FROM submissions').get()).toEqual({n:0});expect(published).toBe(0);f.database.exec('DROP TRIGGER fail_answer');
 f.database.exec("CREATE TRIGGER fail_lock BEFORE UPDATE OF status ON team_round_drafts WHEN NEW.status='locked' BEGIN SELECT RAISE(ABORT,'injected'); END;");
 expect(()=>service.submit(actor,ids.session1,ids.round1,answers)).toThrow();
 expect(f.database.prepare('SELECT count(*) n FROM submissions').get()).toEqual({n:0});expect(f.database.prepare('SELECT count(*) n FROM submission_answers').get()).toEqual({n:0});expect(published).toBe(0);
 expect(f.database.prepare('SELECT status FROM team_round_drafts').get()).toEqual({status:'editable'});
 f.database.exec('DROP TRIGGER fail_lock');expect(service.submit(actor,ids.session1,ids.round1,answers).acceptedOrder).toBe(1);expect(published).toBe(1);
 f.repositories.rounds.create({...round(ids.round2),phase:'Active',startedAt:new Date().toISOString()});f.database.prepare('UPDATE sessions SET current_round_id=? WHERE id=?').run(ids.round2,ids.session1);
 const path=`${f.base}/rounds/${ids.round2}/draft`;expect((await request(f.app).get(path).set('Cookie',cookieOf(f.a))).body.data.status).toBe('editable');
 for(const answer of answers)await request(f.app).put(`${path}/answers/${answer.blankId}`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.a)).set('X-CSRF-Token',f.a.body.data.csrfToken).send({value:answer.value,baseVersion:0,clientMutationId:crypto.randomUUID()});
 expect(new SubmissionService(f.database).submit(actor,ids.session1,ids.round2,answers).acceptedOrder).toBe(1);
});
it('serializes a draft edit racing submission without copying stale client answers',async()=>{
 const f=await draftFixture();await f.edit('one');await f.edit('two',ids.blank2);
 const submitted=request(f.app).post(`${f.base}/rounds/${ids.round1}/submissions`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.a)).set('X-CSRF-Token',f.a.body.data.csrfToken).send({answers:[{blankId:ids.blank1,value:'one'},{blankId:ids.blank2,value:'two'}]});
 const [edit,submit]=await Promise.all([f.edit('race'),submitted]);
 expect([edit.status,submit.status].sort()).toEqual([200,409]);
 const stored=f.database.prepare('SELECT value FROM submission_answers WHERE blank_id=?').get(ids.blank1);
 expect(stored).toEqual(submit.status===200?{value:'one'}:undefined);
});
it('notifies only subscribed Team members after persisted submission and lock',async()=>{
 const f=await draftFixture();await f.edit('one');await f.edit('two',ids.blank2);
 const server=createHttpServer({database:f.database,studentSecurity:{secret:'test-secret-'.repeat(4),allowedOrigins:['http://127.0.0.1:5173']}});
 server.httpServer.listen(0,'127.0.0.1');await once(server.httpServer,'listening');const address=server.httpServer.address();if(!address||typeof address==='string')throw Error('No port');
 const clients=[f.a,f.b,f.other].map(member=>io(`http://127.0.0.1:${address.port}`,{autoConnect:false,transports:['websocket'],reconnection:false,auth:{sessionId:ids.session1},extraHeaders:{Cookie:cookieOf(member),Origin:'http://127.0.0.1:5173'}}));
 try{
  for(const client of clients){const connected=new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('connect_error',reject);});client.connect();await connected;
   const snapshot=new Promise<void>(resolve=>client.once('student:draft:snapshot',()=>resolve()));client.emit('student:draft:watch',{sessionId:ids.session1,roundId:ids.round1});await snapshot;}
  let leaked=false;clients[2].on('student:draft:locked',()=>{leaked=true;});
  const locks=clients.slice(0,2).map(client=>new Promise<any>(resolve=>client.once('student:draft:locked',lock=>{expect(f.database.inTransaction).toBe(false);expect(f.database.prepare('SELECT count(*) n FROM submissions').get()).toEqual({n:1});resolve(lock);})));
  const result=await request(server.app).post(`${f.base}/rounds/${ids.round1}/submissions`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.a)).set('X-CSRF-Token',f.a.body.data.csrfToken).send({answers:[{blankId:ids.blank1,value:'one'},{blankId:ids.blank2,value:'two'}]});
  expect(result.status).toBe(200);const received=await Promise.all(locks);expect(received[0]).toEqual(received[1]);expect(received[0].status).toBe('locked');expect(received[0].version).toBe(3);expect(leaked).toBe(false);
 }finally{clients.forEach(c=>c.disconnect());await new Promise<void>(resolve=>server.socketServer.close(()=>resolve()));}
});
