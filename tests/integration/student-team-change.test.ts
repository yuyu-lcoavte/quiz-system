import request from 'supertest';
import { it, expect } from 'vitest';
import { studentFixture,cookieOf } from '../helpers/student.js';
import { ids,question,round } from '../helpers/foundation.js';
it('requires valid leader handoff, rolls back rejection and blocks moves after first Active',async()=>{
 const f=studentFixture(); const a=await f.join('A'); const b=await f.join('B');
 const move=(successorParticipantId: string|null)=>request(f.app).post(`${f.base}/team-change`).set('Cookie',cookieOf(a)).set('Origin','http://127.0.0.1:5173').set('X-CSRF-Token',a.body.data.csrfToken).send({targetTeamId:ids.team2,successorParticipantId});
 expect((await move(null)).status).toBe(409);
 expect((await move(b.body.data.participantId)).status).toBe(200);
 expect((await request(f.app).get(`${f.base}/me`).set('Cookie',cookieOf(a))).body.data.team.teamId).toBe(ids.team2);
 f.repositories.questions.create(question());f.repositories.rounds.create({...round(),phase:'Ended',startedAt:new Date().toISOString(),endedAt:new Date().toISOString()});
 expect((await move(null)).status).toBe(409);
});
it('rejects a foreign successor and rolls back a handoff if the member move fails',async()=>{
 const f=studentFixture();const a=await f.join('A');const b=await f.join('B');const c=await f.join('C',ids.team2);
 const move=(successorParticipantId:string)=>request(f.app).post(`${f.base}/team-change`).set('Cookie',cookieOf(a)).set('Origin','http://127.0.0.1:5173').set('X-CSRF-Token',a.body.data.csrfToken).send({targetTeamId:ids.team2,successorParticipantId});
 expect((await move(c.body.data.participantId)).status).toBe(409);
 f.database.exec("CREATE TRIGGER fail_move BEFORE UPDATE OF team_id ON participants BEGIN SELECT RAISE(ABORT,'injected'); END;");
 expect((await move(b.body.data.participantId)).status).toBe(500);
 const me=await request(f.app).get(`${f.base}/me`).set('Cookie',cookieOf(a));expect(me.body.data.isLeader).toBe(true);expect(me.body.data.team.teamId).toBe(ids.team1);
});
