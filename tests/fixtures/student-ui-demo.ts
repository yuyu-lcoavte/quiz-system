import { closeSync,mkdirSync,openSync } from 'node:fs';
import { basename,dirname,resolve } from 'node:path';
import { parseUUID } from '@quiz/contracts/domain';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { runMigrations } from '../../apps/server/src/persistence/migrate.js';
import { createFoundationRepositories } from '../../apps/server/src/persistence/repositories/index.js';

// Explicit, one-shot test fixture preparation. Never imported by the application or exposed over HTTP.
const raw=process.env.STUDENT_UI_FIXTURE_PATH;
if(process.env.NODE_ENV!=='test'||!raw)throw Error('Set NODE_ENV=test and an explicit STUDENT_UI_FIXTURE_PATH.');
const path=resolve(raw);
if(basename(path)!=='student-ui-demo.sqlite')throw Error('Use a new student-ui-demo.sqlite file.');
mkdirSync(dirname(path), { recursive: true });
closeSync(openSync(path, 'wx'));
const manager=new DatabaseManager({sqlitePath:path});const db=manager.open();
const id=(n:number)=>parseUUID(`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`)!;
try{
 runMigrations(db);const r=createFoundationRepositories(db),now=new Date().toISOString();
 db.transaction(()=>{
  const activities = [
   { activityCode: 'DEMO-WAIT', phase: 'Waiting', grouped: false, questionCount: 2 },
   { activityCode: 'DEMO-ACTIVE', phase: 'Active', grouped: true, questionCount: 2 },
   { activityCode: 'DEMO-ENDED', phase: 'Ended', grouped: true, questionCount: 2 },
   { activityCode: 'DEMO-SINGLE-ACTIVE', phase: 'Active', grouped: false, questionCount: 1 },
  ] as const;
  for(const [index,{activityCode,phase,grouped,questionCount}] of activities.entries()){
   const base=(index+1)*1000,sessionId=id(base),groupId=id(base+20),roundId=id(base+50),teamId=id(base+10);
   r.sessions.create({id:sessionId,activityCode,currentRoundId:null,stateVersion:0,createdAt:now});
   r.teams.create({id:teamId,sessionId,name:'示範一組',createdAt:now});r.teams.create({id:id(base+11),sessionId,name:'示範二組',createdAt:now});
   const questionGroupId = questionCount > 1 ? groupId : null;
   if (questionGroupId) r.questionGroups.create({id:questionGroupId,sessionId,label:'示範題組',position:0});
   for(let q=0;q<questionCount;q++){
    const questionId=id(base+30+q);r.questions.create({id:questionId,sessionId,questionGroupId,displayNumber:String(q+1),prompt:`示範題目 ${q+1}：請填寫兩個空格。`,position:q});
    for(let b=0;b<2;b++)r.blanks.create({id:id(base+40+q*2+b),questionId,label:`第 ${q+1} 題填空 ${b+1}`,position:b});
   }
   const target = grouped ? { questionId: null, questionGroupId: groupId } : { questionId: id(base+30), questionGroupId: null };
   r.rounds.create({id:roundId,sessionId,...target,phase,createdAt:now,startedAt:phase==='Waiting'?null:now,endedAt:phase==='Ended'?now:null});
   db.prepare('UPDATE sessions SET current_round_id=?,state_version=? WHERE id=?').run(roundId,index,sessionId);
   if(phase==='Ended'){
    const submissionId=id(base+60);r.submissions.create({id:submissionId,teamId,roundId,receivedAt:now,acceptedOrder:1});
    for(let b=0;b<4;b++)r.submissionAnswers.create({submissionId,blankId:id(base+40+b),value:`示範成功答案 ${b+1}`});
    r.results.create({id:id(base+70),roundId,winningSubmissionId:submissionId,createdAt:now});
   }
  }
 }).immediate();console.info(`Created isolated UI fixture: ${path}`);console.info('Activity Codes: DEMO-WAIT, DEMO-ACTIVE, DEMO-ENDED, DEMO-SINGLE-ACTIVE');
}finally{manager.close();}
