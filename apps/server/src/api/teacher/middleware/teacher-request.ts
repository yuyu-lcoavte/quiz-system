import { createRequire } from 'node:module';
import type { UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import type { VerifiedTeacherLogin } from '../../../modules/teacher/auth/login-session-service.js';
import { TEACHER_SESSION_COOKIE } from '../../../modules/teacher/auth/login-session-service.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by teacher-auth middleware after the cookie and login row are verified. */
      teacherLogin?: VerifiedTeacherLogin;
      /** Set by session-scope middleware for /sessions/:sessionId routes. */
      teacherActor?: ActorContext;
      teacherSessionId?: UUID;
    }
  }
}

const cookie = createRequire(import.meta.url)('cookie') as { parse(header: string): Record<string, string | undefined> };

/** Returns the Teacher cookie value; a header with the cookie repeated is treated as missing. */
export function readTeacherCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const occurrences = cookieHeader.split(';').filter((part) => part.trim().startsWith(`${TEACHER_SESSION_COOKIE}=`));
  if (occurrences.length !== 1) return undefined;
  try {
    return cookie.parse(cookieHeader)[TEACHER_SESSION_COOKIE];
  } catch {
    return undefined;
  }
}
