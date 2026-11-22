import type Database from 'better-sqlite3';
import type { Socket } from 'socket.io';
import type { UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import { readTeacherCookie } from '../../../api/teacher/middleware/teacher-request.js';
import { isAllowedTeacherOrigin } from '../../../api/teacher/middleware/teacher-origin.js';
import type { VerifiedTeacherLogin } from './login-session-service.js';

export interface TeacherSocketIdentityOptions {
  readonly database: Database.Database;
  readonly allowedOrigins: readonly string[];
  readonly verifyCookie: (cookieValue: string | undefined) => VerifiedTeacherLogin | null;
}

export interface TeacherSocketIdentity {
  resolveSocketActorContext(socket: Pick<Socket, 'handshake' | 'request'>): ActorContext | null;
  authorizeWatch(actor: ActorContext, sessionId: UUID): boolean;
}

/**
 * Teacher Socket path (student-teacher-decisions.md 5.2 item 1):
 * identity only from a verified Teacher cookie + allowed Origin; `auth.sessionId` selects the Student path and is never Teacher.
 * Runs on every `session:watch`, so logout and expiry apply to the next watch.
 */
export function createTeacherSocketIdentity(options: TeacherSocketIdentityOptions): TeacherSocketIdentity {
  const issued = new WeakSet<object>();
  const sessionExists = options.database.prepare('SELECT 1 FROM sessions WHERE id = ?');

  return {
    resolveSocketActorContext(socket) {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;
      if (auth?.sessionId !== undefined) return null;
      const origin = socket.handshake.headers.origin;
      if (!isAllowedTeacherOrigin(typeof origin === 'string' ? origin : undefined, options.allowedOrigins)) return null;
      if (!options.verifyCookie(readTeacherCookie(socket.request.headers.cookie))) return null;
      const actor: ActorContext = { actorKind: 'teacher', actorId: 'teacher', permissions: ['session:watch'] };
      issued.add(actor);
      return actor;
    },
    authorizeWatch(actor, sessionId) {
      return issued.has(actor)
        && actor.actorKind === 'teacher'
        && actor.permissions.includes('session:watch')
        && Boolean(sessionExists.get(sessionId));
    },
  };
}
