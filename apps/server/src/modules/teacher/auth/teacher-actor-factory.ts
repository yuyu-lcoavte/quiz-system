import type { UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';

/** Permissions issued to the Teacher for one Session (student-teacher-decisions.md 5.1). */
export const TEACHER_SESSION_PERMISSIONS = Object.freeze([
  'session:read',
  'session:watch',
  'target:preview',
  'target:read',
  'results:read',
  'round:end',
] as const);

/** Built per request on the server after the Teacher cookie and Session existence are verified; never from client data. */
export function createTeacherActorContext(sessionId: UUID): ActorContext {
  return { actorKind: 'teacher', actorId: 'teacher', sessionId, permissions: [...TEACHER_SESSION_PERMISSIONS] };
}
