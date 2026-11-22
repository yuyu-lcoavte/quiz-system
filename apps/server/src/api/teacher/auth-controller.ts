import { createRequire } from 'node:module';
import type { RequestHandler } from 'express';
import { parseTeacherLoginRequest, type TeacherMeView } from '@quiz/contracts';
import { HttpError } from '../../errors/http-error.js';
import { verifyPassword } from '../../modules/teacher/auth/password-hash.js';
import type { LoginRateLimiter } from '../../modules/teacher/auth/login-rate-limiter.js';
import {
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_TTL_MS,
  type TeacherLoginSessionService,
} from '../../modules/teacher/auth/login-session-service.js';
import type { TeacherCsrfService } from '../../modules/teacher/auth/teacher-csrf.js';
import type { TeacherConfig } from '../../modules/teacher/config.js';
import { loginAddress } from './middleware/login-rate-limit.js';

const cookie = createRequire(import.meta.url)('cookie') as {
  serialize(name: string, value: string, options: { path: string; httpOnly: boolean; sameSite: 'strict'; secure: boolean; maxAge: number }): string;
};

export interface TeacherAuthControllerDeps {
  readonly config: TeacherConfig;
  readonly sessions: TeacherLoginSessionService;
  readonly csrf: TeacherCsrfService;
  readonly limiter: LoginRateLimiter;
  readonly serviceAccountEmail: () => string | null;
}

export function createTeacherAuthController(deps: TeacherAuthControllerDeps) {
  const secure = deps.config.nodeEnv === 'production';
  const setCookie = (value: string, maxAgeSeconds: number) =>
    cookie.serialize(TEACHER_SESSION_COOKIE, value, { path: '/', httpOnly: true, sameSite: 'strict', secure, maxAge: maxAgeSeconds });

  const login: RequestHandler = async (request, response, next) => {
    try {
      const body = parseTeacherLoginRequest(request.body);
      if (!body) throw new HttpError(400, 'INVALID_INPUT', 'A password is required.');
      const address = loginAddress(request);
      // passwordHash is non-null here: the router answers 503 before this when login is not configured.
      if (!(await verifyPassword(body.password, deps.config.passwordHash!))) {
        deps.limiter.recordFailure(address);
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'The password is incorrect.');
      }
      deps.limiter.recordSuccess(address);
      const { cookieValue } = deps.sessions.create();
      response.setHeader('Set-Cookie', setCookie(cookieValue, TEACHER_SESSION_TTL_MS / 1000));
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  const logout: RequestHandler = (request, response) => {
    deps.sessions.revoke(request.teacherLogin!);
    response.setHeader('Set-Cookie', setCookie('', 0));
    response.status(204).end();
  };

  const me: RequestHandler = (request, response) => {
    const login = request.teacherLogin!;
    const data: TeacherMeView = {
      authenticated: true,
      csrfToken: deps.csrf.issue(login.idDigest),
      expiresAt: login.expiresAt,
      serviceAccountEmail: deps.serviceAccountEmail(),
    };
    response.setHeader('Cache-Control', 'no-store');
    response.json({ data });
  };

  return { login, logout, me };
}
