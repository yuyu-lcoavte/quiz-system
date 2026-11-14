import { it,expect } from 'vitest';
import request from 'supertest';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { ids } from '../helpers/foundation.js';
it('shares individual Blank edits only with the authenticated Team and rejects forged inputs',async()=>{
 const f=await draftFixture();expect((await f.edit('one')).status).toBe(200);expect((await f.edit('two',ids.blank2)).status).toBe(200);
 const read=await request(f.app).get(f.path).set('Cookie',cookieOf(f.b));expect(read.body.data.answers).toHaveLength(2);expect(read.body.data.version).toBe(2);
 expect((await request(f.app).get(f.path).set('Cookie',cookieOf(f.other))).body.data.answers).toEqual([]);
 expect((await request(f.app).get(f.path)).status).toBe(401);
 expect((await f.edit('bad',ids.blankOther)).status).toBe(400);
 expect((await request(f.app).put(`${f.path}/answers/${ids.blank1}`).set('Cookie',cookieOf(f.a)).send({value:'bad',baseVersion:0,clientMutationId:ids.submission1})).status).toBe(403);
});
it('rejects Waiting, Ended, locked and stale Round operations',async()=>{
 const f=await draftFixture();await f.edit('ok');
 for(const phase of ['Waiting','Ended']){f.database.prepare('UPDATE rounds SET phase=? WHERE id=?').run(phase,ids.round1);expect((await f.edit('bad')).status).toBe(409);}
 f.database.prepare("UPDATE rounds SET phase='Active' WHERE id=?").run(ids.round1);
 f.database.prepare("UPDATE team_round_drafts SET status='locked',locked_at=? WHERE team_id=?").run(new Date().toISOString(),ids.team1);
 expect((await f.edit('bad')).status).toBe(409);
});
