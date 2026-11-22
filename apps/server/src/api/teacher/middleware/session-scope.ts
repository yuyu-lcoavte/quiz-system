import type { RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { parseUUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import { createTeacherActorContext } from '../../../modules/teacher/auth/teacher-actor-factory.js';

/**
 * For /sessions/:sessionId routes: validate the id, require the Session to exist,
 * then attach the per-request Teacher ActorContext (research.md R5).
 */
export function createTeacherSessionScopeMiddleware(database: Database.Database): RequestHandler {
  const exists = database.prepare('SELECT 1 FROM sessions WHERE id = ?');
  return (request, _response, next) => {
    const sessionId = parseUUID(request.params.sessionId);
    if (!sessionId) {
      next(new HttpError(400, 'INVALID_INPUT', 'Session ID must be a UUID.'));
      return;
    }
    if (!exists.get(sessionId)) {
      next(new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.'));
      return;
    }
    request.teacherSessionId = sessionId;
    request.teacherActor = createTeacherActorContext(sessionId);
    next();
  };
}
