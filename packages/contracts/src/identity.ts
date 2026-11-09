import type { UUID } from './domain.js';

export type ActorKind = 'teacher' | 'participant';

/** Constructed by trusted server-side authentication/enrollment middleware only. */
export interface ActorContext {
  actorKind: ActorKind;
  actorId: string;
  sessionId?: UUID;
  teamId?: UUID;
  permissions: readonly string[];
}
