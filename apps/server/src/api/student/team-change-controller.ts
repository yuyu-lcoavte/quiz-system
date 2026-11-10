import type { RequestHandler } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import type { TeamChangeService } from '../../modules/student/application/team-change-service.js';
import { studentSessionId } from './enrollment-controller.js';
import { HttpError } from '../../errors/http-error.js';
export function createTeamChangeController(service:TeamChangeService):RequestHandler{return(req,res,next)=>{try{
 const body=req.body;const targetTeamId=parseUUID(body?.targetTeamId);const successor=body?.successorParticipantId===null?null:parseUUID(body?.successorParticipantId);
 if(!body||Object.keys(body).length!==2||!targetTeamId||successor===undefined||(body.successorParticipantId!==null&&!successor))throw new HttpError(400,'INVALID_INPUT','Invalid team-change input.');
 res.json({data:service.change(studentSessionId(req.params.sessionId),req.headers.cookie,targetTeamId,successor)});
}catch(error){next(error);}};}
