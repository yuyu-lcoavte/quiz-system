import type { RequestHandler } from 'express';
import { HttpError } from '../../../errors/http-error.js';
import type { TeacherCsrfService } from '../../../modules/teacher/auth/teacher-csrf.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Runs after teacher-auth: every mutation needs an X-CSRF-Token bound to this login. */
export function createTeacherCsrfMiddleware(csrf: TeacherCsrfService): RequestHandler {
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }
    const login = request.teacherLogin;
    if (!login || !csrf.verify(request.get('X-CSRF-Token'), login.idDigest)) {
      next(new HttpError(403, 'FORBIDDEN', 'A valid Teacher CSRF token is required.'));
      return;
    }
    next();
  };
}
