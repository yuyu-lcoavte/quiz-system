import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import { HttpError } from '../../errors/http-error.js';
import type { StudentIdentityService } from '../../modules/student/application/student-identity-service.js';

declare global {
  namespace Express {
    interface Request { studentCredentialId?: string; }
  }
}

export function createStudentIdentityMiddleware(identity: StudentIdentityService): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      const sessionId = parseUUID(request.params.sessionId);
      if (!sessionId) throw new HttpError(400, 'INVALID_INPUT', 'Session ID must be a UUID.');
      const resolved = identity.resolve(request.headers.cookie, sessionId);
      if (!resolved) throw new HttpError(401, 'UNAUTHENTICATED', 'A valid Student session is required.');
      request.actorContext = resolved.actorContext;
      request.studentCredentialId = resolved.credentialId;
      next();
    } catch (error) {
      next(error);
    }
  };
}
