import type { UUID } from '@quiz/contracts/domain';

/** Room names are server-computed; clients only ever submit a Session identifier. */
export function sessionRoomName(sessionId: UUID): string {
  return `session:${sessionId}`;
}
