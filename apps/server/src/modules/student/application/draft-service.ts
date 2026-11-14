import type Database from 'better-sqlite3';
import type { ActorContext } from '@quiz/contracts/identity';
import type { UUID } from '@quiz/contracts/domain';
import type { StudentDraftChangedPayload,StudentDraftSnapshotPayload } from '@quiz/contracts';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { createStudentRepositories } from '../persistence/index.js';
import { HttpError } from '../../../errors/http-error.js';

export class DraftService {
 private readonly foundation; private readonly student;
 constructor(private readonly db:Database.Database,private readonly publish:(teamId:UUID,change:StudentDraftChangedPayload)=>void=()=>{}){
  this.foundation=createFoundationRepositories(db);this.student=createStudentRepositories(db);
 }
 private scope(actor:ActorContext,sessionId:UUID,roundId:UUID){
  const participant=actor.actorKind==='participant'?this.foundation.participants.findById(actor.actorId as UUID):null;
  if(!participant||actor.sessionId!==sessionId||participant.teamId!==actor.teamId||!this.foundation.teams.listBySession(sessionId).some(t=>t.id===participant.teamId))throw new HttpError(403,'FORBIDDEN','Invalid Student membership.');
  const session=this.foundation.sessions.findById(sessionId);const round=this.foundation.rounds.findById(roundId);
  if(!session||session.currentRoundId!==roundId||!round||round.sessionId!==sessionId||round.phase!=='Active')throw new HttpError(409,'INVALID_PHASE','The current Round must be Active.');
  const now=new Date().toISOString();
  this.student.drafts.createIfAbsent({sessionId,teamId:participant.teamId,roundId,version:0,status:'editable',createdAt:now,updatedAt:now,lockedAt:null});
  return {teamId:participant.teamId,participantId:participant.id,round};
 }
 snapshot(actor:ActorContext,sessionId:UUID,roundId:UUID):StudentDraftSnapshotPayload{
  return this.db.transaction(()=>{
   const {teamId}=this.scope(actor,sessionId,roundId);const draft=this.student.drafts.find(teamId,roundId)!;
   return {sessionId,roundId,version:draft.version,status:draft.status,answers:this.student.draftAnswers.list(teamId,roundId).map(({blankId,value,revision})=>({blankId,value,revision}))};
  }).immediate();
 }
 edit(actor:ActorContext,sessionId:UUID,roundId:UUID,input:{blankId:UUID;value:string;baseVersion:number;clientMutationId:UUID}):StudentDraftChangedPayload{
  if(this.db.inTransaction)throw new Error('Draft edits must own their transaction to publish after commit.');
  let replay=false;let teamId:UUID;
  const result=this.db.transaction(()=>{
   const scope=this.scope(actor,sessionId,roundId);teamId=scope.teamId;
   const blank=this.db.prepare('SELECT q.id,q.question_group_id,q.session_id FROM blanks b JOIN questions q ON q.id=b.question_id WHERE b.id=?').get(input.blankId) as {id:string;question_group_id:string|null;session_id:string}|undefined;
   if(!blank||blank.session_id!==sessionId||!(scope.round.questionId?blank.id===scope.round.questionId:blank.question_group_id===scope.round.questionGroupId))throw new HttpError(400,'INVALID_INPUT','Blank does not belong to the current target.');
   const fingerprint=JSON.stringify([input.blankId,input.value]);
   if(this.student.drafts.find(teamId,roundId)?.status==='locked')throw new HttpError(409,'STALE_STATE','The draft is locked.');
   const receipt=this.db.prepare('SELECT fingerprint,change_json FROM student_draft_mutations WHERE team_id=? AND round_id=? AND client_mutation_id=?').get(teamId,roundId,input.clientMutationId) as {fingerprint:string;change_json:string}|undefined;
   if(receipt){if(receipt.fingerprint!==fingerprint)throw new HttpError(409,'STALE_STATE','Mutation ID was reused with different content.');replay=true;return JSON.parse(receipt.change_json) as StudentDraftChangedPayload;}
   const now=new Date().toISOString();const version=this.student.drafts.incrementVersion(teamId,roundId,now);
   if(version===null)throw new HttpError(409,'STALE_STATE','The draft is locked.');
   this.student.draftAnswers.upsert({teamId,roundId,blankId:input.blankId,value:input.value,revision:version,updatedByParticipantId:scope.participantId,updatedAt:now});
   const change={sessionId,roundId,version,answer:{blankId:input.blankId,value:input.value,revision:version},clientMutationId:input.clientMutationId};
   this.db.prepare('INSERT INTO student_draft_mutations VALUES (?,?,?,?,?)').run(teamId,roundId,input.clientMutationId,fingerprint,JSON.stringify(change));return change;
  }).immediate();
  if(!replay){try{this.publish(teamId!,result);}catch{/* Persistence is authoritative; reconnect recovers a missed notification. */}}
  return result;
 }
}
