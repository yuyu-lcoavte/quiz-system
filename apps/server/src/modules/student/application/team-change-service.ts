import type { UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import type { EnrollmentService } from './enrollment-service.js';
import type { StudentMembershipChangedPayload } from '@quiz/contracts';
export class TeamChangeService {
 constructor(private readonly enrollment:EnrollmentService,private readonly publish?: (scope: StudentMembershipChangedPayload) => void,
  private readonly onlineParticipants: (scope: StudentMembershipChangedPayload) => ReadonlySet<UUID> = () => new Set()){}
 change(sessionId:UUID,cookie:string|undefined,targetTeamId:UUID){
  const e=this.enrollment;
  const change=e.database.transaction(()=>{
   const member=e.membership(cookie,sessionId);
   if(e.hasStarted(sessionId))throw new HttpError(409,'INVALID_PHASE','Team changes close after first Active.');
   if(!e.foundation.teams.listBySession(sessionId).some(t=>t.id===targetTeamId)||targetTeamId===member.team.teamId)throw new HttpError(400,'INVALID_INPUT','Invalid destination Team.');
   const now=new Date().toISOString();
   if(member.isLeader){
    const sourceTeamId = member.team.teamId;
    const remaining = e.student.teamJoinOrder.listParticipants(sourceTeamId).filter(id => id !== member.participantId);
    const online = remaining.length ? this.onlineParticipants({sessionId,teamId:sourceTeamId}) : new Set<UUID>();
    const onlineSuccessor = remaining.find(id => online.has(id));
    const successor = onlineSuccessor ?? remaining[0];
    const changed = successor
     ? e.student.teamLeaders.replaceIfCurrent(sourceTeamId, member.participantId,
       {participantId:successor,assignedAt:now,assignedByKind:'system',assignedById:null}, !onlineSuccessor)
     : e.student.teamLeaders.removeIfCurrent(sourceTeamId, member.participantId);
    if (!changed) throw new HttpError(409, 'STALE_STATE', 'Leader changed.');
   }
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
