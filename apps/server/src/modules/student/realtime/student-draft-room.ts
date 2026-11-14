import { parseUUID, type UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';

/** Room identifiers are derived only from a verified ActorContext and validated Round ID. */
export function studentDraftRoomName(actor: ActorContext, roundId: string): string | null {
  const validRoundId = parseUUID(roundId);
  if (actor.actorKind !== 'participant' || !actor.sessionId || !actor.teamId || !validRoundId) return null;
  return `student:team:${actor.teamId}:round:${validRoundId}`;
}

export function studentDraftRoomScope(actor: ActorContext, roundId: string): { sessionId: UUID; teamId: UUID; roundId: UUID } | null {
  const validRoundId = parseUUID(roundId);
  if (actor.actorKind !== 'participant' || !actor.sessionId || !actor.teamId || !validRoundId) return null;
  const sessionId = parseUUID(actor.sessionId);
  const teamId = parseUUID(actor.teamId);
  return sessionId && teamId ? { sessionId, teamId, roundId: validRoundId } : null;
}
