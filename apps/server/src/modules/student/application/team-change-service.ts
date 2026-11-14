import type { UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import type { EnrollmentService } from './enrollment-service.js';
import type { StudentMembershipChangedPayload } from '@quiz/contracts';
export class TeamChangeService {
 constructor(private readonly enrollment:EnrollmentService,private readonly publish?: (scope: StudentMembershipChangedPayload) => void){}
 change(sessionId:UUID,cookie:string|undefined,targetTeamId:UUID,successorParticipantId:UUID|null){
  const e=this.enrollment;
  const change=e.database.transaction(()=>{
   const member=e.membership(cookie,sessionId);
   if(e.database.prepare('SELECT 1 FROM rounds WHERE session_id=? AND (started_at IS NOT NULL OR phase IN (\'Active\',\'Ended\'))').get(sessionId))throw new HttpError(409,'INVALID_PHASE','Team changes close after first Active.');
   if(!e.foundation.teams.listBySession(sessionId).some(t=>t.id===targetTeamId)||targetTeamId===member.team.teamId)throw new HttpError(400,'INVALID_INPUT','Invalid destination Team.');
   const now=new Date().toISOString();
   if(member.isLeader){
    const successor=successorParticipantId?e.foundation.participants.findById(successorParticipantId):null;
    if(!successor||successor.teamId!==member.team.teamId||successor.id===member.participantId)throw new HttpError(409,'LEADER_TRANSFER_REJECTED','A source-Team successor is required.');
    if(!e.student.teamLeaders.replaceIfCurrent(member.team.teamId,member.participantId,{participantId:successor.id,assignedAt:now,assignedByKind:'participant',assignedById:member.participantId}))throw new HttpError(409,'STALE_STATE','Leader changed.');
   }else if(successorParticipantId!==null)throw new HttpError(400,'INVALID_INPUT','Only a leader supplies a successor.');
   e.student.teamJoinOrder.remove(member.participantId);
   e.foundation.participants.moveToTeam(member.participantId,targetTeamId);
   e.student.teamJoinOrder.append(targetTeamId,member.participantId);
   e.student.teamLeaders.createIfAbsent({teamId:targetTeamId,participantId:member.participantId,assignedAt:now,assignedByKind:'system',assignedById:null});
   return {membership:e.membership(cookie,sessionId),sourceTeamId:member.team.teamId};
  }).immediate();
  for(const teamId of [change.sourceTeamId,targetTeamId]) this.publish?.({sessionId,teamId});
  return change.membership;
 }
}
