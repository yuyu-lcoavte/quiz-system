import type { RequestHandler } from 'express';
import type { JoinOptionsService } from '../../modules/student/application/join-options-service.js';
export function createJoinOptionsController(service:JoinOptionsService):RequestHandler{return(req,res,next)=>{try{res.json({data:service.get(String(req.params.activityCode))});}catch(error){next(error);}};}
