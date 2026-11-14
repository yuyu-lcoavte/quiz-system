import type { RequestHandler } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import { parseStudentEnrollmentRequest } from '@quiz/contracts';
import type { EnrollmentService } from '../../modules/student/application/enrollment-service.js';
import { serializeStudentSessionCookie } from '../../modules/student/application/student-identity-service.js';
import { HttpError } from '../../errors/http-error.js';
export function studentSessionId(value:unknown){const id=parseUUID(value);if(!id)throw new HttpError(400,'INVALID_INPUT','Invalid Session ID.');return id;}
export function createEnrollmentController(service:EnrollmentService,nodeEnv:'development'|'test'|'production'){
 const wrap=(operation:(req:Parameters<RequestHandler>[0],res:Parameters<RequestHandler>[1])=>unknown):RequestHandler=>(req,res,next)=>{try{res.json({data:operation(req,res)});}catch(error){next(error);}};
 return {
  enroll:wrap((req,res)=>{
   const input=parseStudentEnrollmentRequest(req.body);if(!input)throw new HttpError(400,'INVALID_INPUT','Invalid enrollment input.');
   if(nodeEnv==='production'&&!req.secure)throw new HttpError(403,'FORBIDDEN','HTTPS is required.');
   const result=service.enroll(studentSessionId(req.params.sessionId),input,req.headers.cookie,req.get('X-CSRF-Token'));
   if(result.newToken)res.setHeader('Set-Cookie',serializeStudentSessionCookie(result.newToken,{nodeEnv,isHttps:req.secure,maxAgeSeconds:86400}));
   res.setHeader('Cache-Control','no-store');return {...result.membership,csrfToken:result.csrfToken};
  }),
  me:wrap((req,res)=>{res.setHeader('Cache-Control','no-store');return service.membershipDetails(req.headers.cookie,studentSessionId(req.params.sessionId));}),
  csrf:wrap((req,res)=>{
   const sessionId=studentSessionId(req.params.sessionId);const identity=service.identity.resolve(req.headers.cookie,sessionId);
   if(!identity)throw new HttpError(401,'UNAUTHENTICATED','Valid Student identity required.');
   res.setHeader('Cache-Control','no-store');return {csrfToken:service.csrf.issue({credentialId:identity.credentialId,sessionId}),expiresAt:new Date(Date.now()+900000).toISOString()};
  }),
 };
}
