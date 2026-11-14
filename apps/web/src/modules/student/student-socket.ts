import { io } from 'socket.io-client';
import type { UUID } from '@quiz/contracts/domain';

/** Browser WebSocket handshakes carry Origin; same-origin polling GET may omit it. */
export function createStudentSocket(sessionId: UUID, options: { url?: string; autoConnect?: boolean } = {}) {
  return io(options.url ?? '/', {
    autoConnect: options.autoConnect ?? true,
    auth: { sessionId },
    withCredentials: true,
    transports: ['websocket'],
  });
}
