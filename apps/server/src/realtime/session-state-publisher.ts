import type { Server as SocketIoServer } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import type { SessionStateSnapshot } from '@quiz/contracts/domain';
import { sessionRoomName } from './session-room.js';

/** Publishes only monotonically newer committed snapshots to the matching server-managed room. */
export class SessionStatePublisher {
  private readonly versions = new Map<string, number>();
  constructor(private readonly io: SocketIoServer<ClientToServerEvents, ServerToClientEvents>) {}

  publish(snapshot: SessionStateSnapshot): boolean {
    const latest = this.versions.get(snapshot.sessionId) ?? -1;
    if (snapshot.stateVersion <= latest) return false;
    this.versions.set(snapshot.sessionId, snapshot.stateVersion);
    this.io.to(sessionRoomName(snapshot.sessionId)).emit('session:state:changed', snapshot);
    return true;
  }
}
