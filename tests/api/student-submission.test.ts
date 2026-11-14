import request from 'supertest';
import { it,expect } from 'vitest';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { ids,questionGroup,question,round,blank } from '../helpers/foundation.js';
export async function submissionFixture(){
 const f=await draftFixture();await f.edit('one');await f.edit('two',ids.blank2);
 const answers=[{blankId:ids.blank1,value:'one'},{blankId:ids.blank2,value:'two'}];
 const submit=(member=f.a,body:unknown={answers})=>request(f.app).post(`${f.base}/rounds/${ids.round1}/submissions`).set('Cookie',cookieOf(member)).set('Origin','http://127.0.0.1:5173').set('X-CSRF-Token',member.body.data.csrfToken).send(body as object);
 return {...f,answers,submit};
}
it('accepts the leader once, persists draft values and locks all member edits',async()=>{
 const f=await submissionFixture();expect((await f.submit(f.b)).status).toBe(403);
 const result=await f.submit();expect(result.status).toBe(200);expect(result.body.data.acceptedOrder).toBe(1);expect(result.body.data.draftStatus).toBe('locked');
 expect(f.database.prepare('SELECT value FROM submission_answers ORDER BY blank_id').all()).toEqual([{value:'one'},{value:'two'}]);
 expect((await f.submit()).body.error.code).toBe('DUPLICATE_SUBMISSION');expect((await f.edit('locked')).status).toBe(409);
 expect((await request(f.app).get(f.path).set('Cookie',cookieOf(f.b))).body.data.status).toBe('locked');
});
it('rejects forged fields, missing coverage, stale answers, whitespace and foreign scope',async()=>{
 const f=await submissionFixture();
 for(const body of [{answers:f.answers,teamId:ids.team2},{answers:f.answers.slice(0,1)},{answers:[...f.answers,{blankId:ids.blankOther,value:'x'}]}])expect((await f.submit(f.a,body)).status).toBe(400);
 expect((await f.submit(f.a,{answers:f.answers.map(a=>({...a,value:'forged'}))})).status).toBe(409);
 await f.edit('  ');expect((await f.submit()).status).toBe(400);
 expect((await request(f.app).post(`/api/v1/student/sessions/${ids.session2}/rounds/${ids.round1}/submissions`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.a)).send({answers:f.answers})).status).toBe(401);
});
it('rejects Waiting/Ended and empty targets; validates every QuestionGroup Blank',async()=>{
 const f=await submissionFixture();
 for(const phase of ['Waiting','Ended']){f.database.prepare('UPDATE rounds SET phase=? WHERE id=?').run(phase,ids.round1);expect((await f.submit()).status).toBe(409);}
 f.database.prepare("UPDATE rounds SET phase='Active' WHERE id=?").run(ids.round1);
 f.repositories.questionGroups.create(questionGroup());f.database.prepare('UPDATE questions SET question_group_id=? WHERE id=?').run(ids.group1,ids.question1);
 f.database.prepare('UPDATE rounds SET question_id=NULL,question_group_id=? WHERE id=?').run(ids.group1,ids.round1);
 f.repositories.questions.create(question(ids.question2,ids.session1,{questionGroupId:ids.group1}));
 f.repositories.blanks.create(blank(ids.blankOther,ids.question2));
 expect((await f.submit()).status).toBe(400);
 await f.edit('third',ids.blankOther);
 expect((await f.submit(f.a,{answers:[...f.answers,{blankId:ids.blankOther,value:'third'}]})).status).toBe(200);
});
it('rejects a zero-Blank target and missing authorization or CSRF',async()=>{
 const f=await submissionFixture();const path=`${f.base}/rounds/${ids.round1}/submissions`;
 expect((await request(f.app).post(path).set('Origin','http://127.0.0.1:5173').send({answers:f.answers})).status).toBe(401);
 expect((await request(f.app).post(path).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.a)).send({answers:f.answers})).status).toBe(403);
 f.repositories.questions.create(question(ids.question2));f.repositories.rounds.create({...round(ids.round2,ids.session1,{questionId:ids.question2}),phase:'Active',startedAt:new Date().toISOString()});
 f.database.prepare('UPDATE sessions SET current_round_id=? WHERE id=?').run(ids.round2,ids.session1);
 expect((await request(f.app).post(`${f.base}/rounds/${ids.round2}/submissions`).set('Origin','http://127.0.0.1:5173').set('Cookie',cookieOf(f.a)).set('X-CSRF-Token',f.a.body.data.csrfToken).send({answers:[]})).status).toBe(400);
 expect((await f.submit()).status).toBe(409);
 f.repositories.questionGroups.create(questionGroup(ids.group2));expect(()=>f.repositories.rounds.create({...round(ids.round3,ids.session1,{questionGroupId:ids.group2}),phase:'Active',startedAt:new Date().toISOString()})).toThrow();
});
