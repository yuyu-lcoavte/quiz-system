import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { draftFixture } from '../helpers/student-draft.js';
import { ids,questionGroup } from '../helpers/foundation.js';
import { DraftService } from '../../apps/server/src/modules/student/application/draft-service.js';
import { StudentIdentityService } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { cookieOf } from '../helpers/student.js';
it('increments versions by server acceptance, replays mutations and rolls back failed writes',async()=>{
 const f=await draftFixture(); const id=randomUUID();const first=await f.edit('first',undefined,id);
 await f.edit('last');const retry=await f.edit('first',undefined,id);expect(retry.body.data).toEqual(first.body.data);
 expect(f.database.prepare('SELECT version FROM team_round_drafts').get()).toEqual({version:2});
 expect(f.database.prepare('SELECT value FROM team_round_draft_answers').get()).toEqual({value:'last'});
 f.database.exec("CREATE TRIGGER fail_draft BEFORE UPDATE ON team_round_draft_answers BEGIN SELECT RAISE(ABORT,'injected'); END;");
 expect((await f.edit('failure')).status).toBe(500);expect(f.database.prepare('SELECT version FROM team_round_drafts').get()).toEqual({version:2});
});
it('supports QuestionGroup Blank ownership, concurrent edits and no post-rollback publication',async()=>{
 const f=await draftFixture();f.repositories.questionGroups.create(questionGroup());
 f.database.prepare('UPDATE questions SET question_group_id=? WHERE id=?').run(ids.group1,ids.question1);
 f.database.prepare('UPDATE rounds SET question_id=NULL,question_group_id=? WHERE id=?').run(ids.group1,ids.round1);
 const results=await Promise.all([f.edit('A'),f.edit('B')]);expect(results.map(r=>r.body.data.version).sort()).toEqual([1,2]);
 const last=results.find(r=>r.body.data.version===2)!;expect(f.database.prepare('SELECT value FROM team_round_draft_answers').get()).toEqual({value:last.body.data.answer.value});
 const identity=new StudentIdentityService(createStudentRepositories(f.database)).resolve(cookieOf(f.a),ids.session1)!;
 let published=0;const service=new DraftService(f.database,()=>{published++;});
 f.database.exec("CREATE TRIGGER fail_mutation BEFORE INSERT ON student_draft_mutations BEGIN SELECT RAISE(ABORT,'injected'); END;");
 expect(()=>service.edit(identity.actorContext,ids.session1,ids.round1,{blankId:ids.blank1,value:'rollback',baseVersion:0,clientMutationId:ids.submission2})).toThrow();expect(published).toBe(0);
 expect(f.database.prepare('SELECT version FROM team_round_drafts').get()).toEqual({version:2});
 expect(()=>service.snapshot({...identity.actorContext,sessionId:ids.session2},ids.session2,ids.round1)).toThrow();
});
