import type { RequestHandler } from 'express';
import { HttpError } from '../../../errors/http-error.js';
import type { TeacherLoginSessionService } from '../../../modules/teacher/auth/login-session-service.js';
import { readTeacherCookie } from './teacher-request.js';

export function createTeacherAuthMiddleware(sessions: TeacherLoginSessionService): RequestHandler {
  return (request, _response, next) => {
    const login = sessions.verify(readTeacherCookie(request.headers.cookie));
    if (!login) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Teacher login is required.'));
      return;
    }
    request.teacherLogin = login;
    next();
  };
}
