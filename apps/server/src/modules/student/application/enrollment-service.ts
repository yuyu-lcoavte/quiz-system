import { randomUUID,randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import type { StudentMembershipView,StudentEnrollmentRequest } from '@quiz/contracts';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { createStudentRepositories } from '../persistence/index.js';
import { hashStudentSessionToken,readStudentCookie,StudentIdentityService } from './student-identity-service.js';
import type { StudentCsrfService } from '../../../api/middleware/student-csrf.js';
import { HttpError } from '../../../errors/http-error.js';
export class EnrollmentService {
 readonly student; readonly foundation; readonly identity;
 constructor(readonly database:Database.Database,readonly csrf:StudentCsrfService,private readonly lifetimeMs=86400000){
  this.student=createStudentRepositories(database);this.foundation=createFoundationRepositories(database);this.identity=new StudentIdentityService(this.student);
 }
 membership(cookie:string|undefined,sessionId:UUID):StudentMembershipView {
  const identity=this.identity.resolve(cookie,sessionId);if(!identity)throw new HttpError(401,'UNAUTHENTICATED','Valid Student identity required.');
  const p=this.foundation.participants.findById(identity.actorContext.actorId as UUID)!;
  const team=this.foundation.teams.listBySession(sessionId).find(t=>t.id===p.teamId)!;
  return {sessionId,participantId:p.id,team:{teamId:team.id,name:team.name},isLeader:this.student.teamLeaders.findByTeamId(team.id)?.participantId===p.id};
 }
 enroll(sessionId:UUID,input:StudentEnrollmentRequest,cookie:string|undefined,csrfToken?:string){
  return this.database.transaction(()=>{
   if(!this.foundation.sessions.findById(sessionId))throw new HttpError(404,'SESSION_NOT_FOUND','Session not found.');
   const team=this.foundation.teams.listBySession(sessionId).find(t=>t.id===input.teamId);
   if(!team)throw new HttpError(400,'INVALID_INPUT','Select an existing Team in this Session.');
   if(!input.displayName.trim() || input.displayName.trim().length>100)throw new HttpError(400,'INVALID_INPUT','Display name must contain 1 to 100 characters.');
   const now=new Date().toISOString();const token=readStudentCookie(cookie);
   let credential=token?this.student.credentials.findByTokenHash(hashStudentSessionToken(token)):null;
   if(cookie?.includes('student_session') && (!token||!credential||credential.revokedAt||credential.expiresAt<=now))throw new HttpError(401,'UNAUTHENTICATED','Student credential is invalid.');
   let newToken:string|undefined;
   if(!credential){newToken=randomBytes(32).toString('base64url');credential={id:randomUUID() as UUID,tokenHash:hashStudentSessionToken(newToken),createdAt:now,expiresAt:new Date(Date.now()+this.lifetimeMs).toISOString(),revokedAt:null,lastSeenAt:now};this.student.credentials.create(credential);}
   const mapping=this.student.browserParticipants.findForSession(credential.id,sessionId);
   if(mapping){
    if(!this.csrf.verify(csrfToken,{credentialId:credential.id,sessionId}))throw new HttpError(403,'FORBIDDEN','Valid CSRF token required for repeat enrollment.');
    if(mapping.teamId!==team.id)throw new HttpError(409,'STALE_STATE','Enrollment cannot change an existing Team.');
   }else{
    const participantId=randomUUID() as UUID;
    this.foundation.participants.create({id:participantId,teamId:team.id,displayName:input.displayName.trim(),createdAt:now});
    this.student.browserParticipants.create({credentialId:credential.id,sessionId,participantId,createdAt:now});
    this.student.teamLeaders.createIfAbsent({teamId:team.id,participantId,assignedAt:now,assignedByKind:'system',assignedById:null});
   }
   const header=newToken?`student_session=${newToken}`:cookie;
   return {membership:this.membership(header,sessionId),newToken,csrfToken:this.csrf.issue({credentialId:credential.id,sessionId})};
  }).immediate();
 }
}
