import type { RequestHandler } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import type { StudentResultService } from '../../modules/student/application/student-result-service.js';
import { HttpError } from '../../errors/http-error.js';

export function createStudentResultController(service: StudentResultService): RequestHandler {
  return (request, response, next) => {
    try {
      const sessionId = parseUUID(request.params.sessionId), roundId = parseUUID(request.params.roundId);
      if (!sessionId || !roundId) throw new HttpError(400, 'INVALID_INPUT', 'Invalid Session or Round.');
      if (!request.actorContext) throw new HttpError(401, 'UNAUTHENTICATED', 'Student identity is required.');
      response.setHeader('Cache-Control', 'no-store');
      response.json({ data: service.get(request.actorContext, sessionId, roundId) });
    } catch (error) { next(error); }
  };
}
