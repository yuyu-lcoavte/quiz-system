import type { Server as SocketIoServer, Socket } from 'socket.io';
import type { ActorContext } from '@quiz/contracts/identity';
import { parseSessionWatchPayload, type ClientToServerEvents, type ServerToClientEvents, type SessionErrorPayload } from '@quiz/contracts/realtime';
import type { UUID } from '@quiz/contracts/domain';
import type { SocketServerOptions } from './socket-server.js';
import { sessionRoomName } from './session-room.js';

type FoundationSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type FoundationSocketServer = SocketIoServer<ClientToServerEvents, ServerToClientEvents>;

function sendSocketError(socket: FoundationSocket, error: SessionErrorPayload): void {
  socket.emit('session:error', error);
}

export function registerSessionEvents(server: FoundationSocketServer, options: SocketServerOptions): void {
  server.on('connection', (socket) => {
    socket.on('session:watch', (untrustedPayload) => {
      const payload = parseSessionWatchPayload(untrustedPayload);
      if (!payload) {
        sendSocketError(socket, { code: 'INVALID_INPUT', message: 'The session watch payload is invalid.' });
        return;
      }
      let actor: ActorContext | null;
      try { actor = options.resolveSocketActorContext?.(socket) ?? null; } catch { actor = null; }
      if (!actor) {
        sendSocketError(socket, { code: 'UNAUTHENTICATED', message: 'A verified actor context is required to watch a session.' });
        return;
      }

      let authorization: boolean | Promise<boolean>;
      try { authorization = options.authorizeWatch?.(actor, payload.sessionId) ?? false; } catch { authorization = false; }
      void Promise.resolve(authorization).then(async (allowed) => {
        if (!allowed) {
          sendSocketError(socket, { code: 'FORBIDDEN', message: 'The actor is not allowed to watch this session.' });
          return;
        }
        const roomName = sessionRoomName(payload.sessionId as UUID);
        try {
          await socket.join(roomName);
          const snapshot = await options.getSessionState?.(payload.sessionId);
          if (!snapshot) {
            await socket.leave(roomName);
            sendSocketError(socket, { code: 'SESSION_NOT_FOUND', message: 'The Session does not exist.' });
            return;
          }
          socket.emit('session:state', snapshot);
        } catch {
          await socket.leave(roomName);
          sendSocketError(socket, { code: 'INTERNAL_ERROR', message: 'The session watch could not be established.' });
        }
      }).catch(() => {
        sendSocketError(socket, { code: 'FORBIDDEN', message: 'The actor is not allowed to watch this session.' });
      });
    });
  });
}
