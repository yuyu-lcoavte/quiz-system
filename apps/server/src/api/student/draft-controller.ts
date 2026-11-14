import type { RequestHandler } from 'express';
import { parseStudentDraftEditPayload } from '@quiz/contracts';
import { parseUUID } from '@quiz/contracts/domain';
import type { DraftService } from '../../modules/student/application/draft-service.js';
import { HttpError } from '../../errors/http-error.js';
export function createDraftController(service:DraftService){
 const handle=(edit:boolean):RequestHandler=>(req,res,next)=>{try{
  const sessionId=parseUUID(req.params.sessionId),roundId=parseUUID(req.params.roundId);
  if(!sessionId||!roundId)throw new HttpError(400,'INVALID_INPUT','Invalid Session or Round.');
  if(!req.actorContext)throw new HttpError(401,'UNAUTHENTICATED','Student identity required.');
  if(!edit){res.json({data:service.snapshot(req.actorContext,sessionId,roundId)});return;}
  const body=req.body;
  if(!body||Object.keys(body).length!==3)throw new HttpError(400,'INVALID_INPUT','Invalid draft input.');
  const input=parseStudentDraftEditPayload({...body,sessionId,roundId,blankId:req.params.blankId,csrfToken:req.get('X-CSRF-Token')});
  if(!input)throw new HttpError(400,'INVALID_INPUT','Invalid draft edit.');
  res.json({data:service.edit(req.actorContext,sessionId,roundId,input)});
 }catch(error){next(error);}};
 return {snapshot:handle(false),edit:handle(true)};
}
