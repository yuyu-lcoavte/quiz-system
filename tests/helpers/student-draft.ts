import { studentFixture,cookieOf } from './student.js';
import { ids,question,blank,round } from './foundation.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
export async function draftFixture(){
 const f=studentFixture(); f.repositories.questions.create(question());f.repositories.blanks.create(blank());f.repositories.blanks.create(blank(ids.blank2,ids.question1,1));
 f.repositories.rounds.create({...round(),phase:'Active',startedAt:new Date().toISOString()});
 f.database.prepare('UPDATE sessions SET current_round_id=? WHERE id=?').run(ids.round1,ids.session1);
 const a=await f.join('A'),b=await f.join('B'),other=await f.join('Other',ids.team2);
 const path=`${f.base}/rounds/${ids.round1}/draft`;
 const edit=(value:string,blankId=ids.blank1,mutationId=randomUUID())=>request(f.app).put(`${path}/answers/${blankId}`).set('Cookie',cookieOf(a)).set('Origin','http://127.0.0.1:5173').set('X-CSRF-Token',a.body.data.csrfToken).send({value,baseVersion:0,clientMutationId:mutationId});
 return {...f,a,b,other,path,edit};
}
