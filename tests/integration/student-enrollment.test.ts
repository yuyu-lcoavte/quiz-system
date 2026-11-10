import request from 'supertest';
import { it, expect } from 'vitest';
import { studentFixture, cookieOf } from '../helpers/student.js';
import { ids, question, round } from '../helpers/foundation.js';
it('serializes first joins and requires CSRF on bound retries without duplicating participants', async () => {
 const f = studentFixture(); const [a,b] = await Promise.all([f.join('A'),f.join('B')]);
 expect([a.status,b.status]).toEqual([200,200]); expect([a.body.data.isLeader,b.body.data.isLeader].filter(Boolean)).toHaveLength(1);
 expect((await request(f.app).post(`${f.base}/enrollments`).set('Cookie',cookieOf(a)).set('Origin','http://127.0.0.1:5173').send({teamId:ids.team1,displayName:'A'})).status).toBe(403);
 const retry = await request(f.app).post(`${f.base}/enrollments`).set('Cookie',cookieOf(a)).set('Origin','http://127.0.0.1:5173').set('X-CSRF-Token',a.body.data.csrfToken).send({teamId:ids.team1,displayName:'A'});
 expect(retry.body.data.participantId).toBe(a.body.data.participantId);
 expect(f.database.prepare('SELECT count(*) n FROM participants').get()).toEqual({n:2});
});
it('rejects invalid origins and forged/cross-session Team input without writes', async () => {
 const f=studentFixture();
 for(const origin of [undefined,'null','bad','https://evil.example']) {
 let r=request(f.app).post(`${f.base}/enrollments`); if(origin)r=r.set('Origin',origin);
 expect((await r.send({teamId:ids.team1,displayName:'A'})).status).toBe(403);
 }
 expect((await f.join('A',ids.teamOtherSession)).status).toBe(400);
 expect((await request(f.app).post(`${f.base}/enrollments`).set('Origin','http://127.0.0.1:5173').send({teamId:ids.team1,displayName:'A',isLeader:true})).status).toBe(400);
 expect(f.database.prepare('SELECT count(*) n FROM participants').get()).toEqual({n:0});
});
it('allows late first enrollment into an existing Team', async()=>{
 const f=studentFixture(); f.repositories.questions.create(question()); f.repositories.rounds.create({...round(),phase:'Active',startedAt:new Date().toISOString()});
 expect((await f.join()).status).toBe(200);
});
it('rolls back credential and participant creation when persistence fails',async()=>{
 const f=studentFixture();f.database.exec("CREATE TRIGGER fail_leader BEFORE INSERT ON team_leaders BEGIN SELECT RAISE(ABORT,'injected'); END;");
 expect((await f.join()).status).toBe(500);
 expect(f.database.prepare('SELECT count(*) n FROM participants').get()).toEqual({n:0});
 expect(f.database.prepare('SELECT count(*) n FROM student_browser_credentials').get()).toEqual({n:0});
});
