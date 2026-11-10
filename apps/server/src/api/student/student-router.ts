import { Router } from 'express';
import type Database from 'better-sqlite3';
import { JoinOptionsService } from '../../modules/student/application/join-options-service.js';
import { EnrollmentService } from '../../modules/student/application/enrollment-service.js';
import { TeamChangeService } from '../../modules/student/application/team-change-service.js';
import { createStudentCsrfService,createStudentCsrfMiddleware } from '../middleware/student-csrf.js';
import { createStudentOriginMiddleware } from '../middleware/student-origin.js';
import { createStudentIdentityMiddleware } from '../middleware/student-identity.js';
import { createActivityCodeRateLimiter,type ActivityCodeRateLimitOptions } from '../middleware/activity-code-rate-limit.js';
import { createJoinOptionsController } from './join-options-controller.js';
import { createEnrollmentController } from './enrollment-controller.js';
import { createTeamChangeController } from './team-change-controller.js';
import { HttpError } from '../../errors/http-error.js';
import { DraftService } from '../../modules/student/application/draft-service.js';
import { createDraftController } from './draft-controller.js';
import { SubmissionService } from '../../modules/student/application/submission-service.js';
import { createSubmissionController } from './submission-controller.js';

export interface StudentSecurityOptions {secret:string;allowedOrigins:readonly string[];nodeEnv?:'development'|'test'|'production';}

/** Student-owned HTTP route root. Business endpoints are added by their story tasks. */
export function createStudentRouter(database?:Database.Database,security?:StudentSecurityOptions,limit:ActivityCodeRateLimitOptions={maxRequests:30,windowMs:60000},draftService?:DraftService,submissionService?:SubmissionService) {
  const router=Router();if(!database)return router;
  router.get('/join-options/:activityCode',createActivityCodeRateLimiter(limit),createJoinOptionsController(new JoinOptionsService(database)));
  if(!security)return router;
  const csrf=createStudentCsrfService({secret:security.secret});const service=new EnrollmentService(database,csrf);
  const controller=createEnrollmentController(service,security.nodeEnv??'development');
  const origin=createStudentOriginMiddleware(security.allowedOrigins);const identity=createStudentIdentityMiddleware(service.identity);
  router.post('/sessions/:sessionId/rounds/:roundId/submissions',origin,identity,createStudentCsrfMiddleware(csrf),createSubmissionController(submissionService??new SubmissionService(database)));
  const draft=createDraftController(draftService??new DraftService(database));
  router.get('/sessions/:sessionId/rounds/:roundId/draft',identity,draft.snapshot);
  router.put('/sessions/:sessionId/rounds/:roundId/draft/answers/:blankId',origin,identity,createStudentCsrfMiddleware(csrf),draft.edit);
  const buckets=new Map<string,{n:number;until:number}>();
  router.post('/sessions/:sessionId/enrollments',origin,(req,_res,next)=>{
   const now=Date.now(); for(const [key,v] of buckets)if(v.until<=now)buckets.delete(key);
   const key=`${req.ip}:${req.params.sessionId}`;const bucket=buckets.get(key)??{n:0,until:now+limit.windowMs};bucket.n++;buckets.set(key,bucket);
   next(bucket.n>limit.maxRequests?new HttpError(429,'RATE_LIMITED','Too many enrollment requests.'):undefined);
  },controller.enroll);
  router.get('/sessions/:sessionId/me',controller.me);
  router.get('/sessions/:sessionId/csrf-token',controller.csrf);
  router.post('/sessions/:sessionId/team-change',origin,identity,createStudentCsrfMiddleware(csrf),createTeamChangeController(new TeamChangeService(service)));
  return router;
}
