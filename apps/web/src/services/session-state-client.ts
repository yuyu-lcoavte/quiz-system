import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import { parseSessionStateSnapshot } from '@quiz/contracts/realtime';
import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';

export interface SessionStateClient {
  getSnapshot(): SessionStateSnapshot | null;
  subscribe(listener: (snapshot: SessionStateSnapshot) => void): () => void;
  dispose(): void;
}

export function createSessionStateClient(
  sessionId: UUID,
  options: { url?: string; socket?: Socket<ServerToClientEvents, ClientToServerEvents> } = {},
): SessionStateClient {
  const socket = options.socket ?? io(options.url ?? '/', { autoConnect: true });
  const listeners = new Set<(snapshot: SessionStateSnapshot) => void>();
  let snapshot: SessionStateSnapshot | null = null;

  const accept = (candidate: unknown) => {
    const next = parseSessionStateSnapshot(candidate);
    if (!next || next.sessionId !== sessionId || (snapshot && next.stateVersion <= snapshot.stateVersion)) return;
    snapshot = next;
    for (const listener of listeners) listener(next);
  };
  const watch = () => socket.emit('session:watch', { sessionId });
  socket.on('connect', watch);
  socket.on('session:state', accept);
  socket.on('session:state:changed', accept);
  if (socket.connected) watch();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (snapshot) listener(snapshot);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      socket.off('connect', watch);
      socket.off('session:state', accept);
      socket.off('session:state:changed', accept);
      listeners.clear();
      if (!options.socket) socket.disconnect();
    },
  };
}
