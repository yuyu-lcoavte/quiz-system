import type { Server as HttpServer } from 'node:http';
import {
  Server as SocketIoServer,
  type Socket,
} from 'socket.io';
import type { ActorContext } from '@quiz/contracts/identity';
import {
  parseSessionWatchPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionErrorPayload,
} from '@quiz/contracts/realtime';
import type { UUID } from '@quiz/contracts/domain';
import { sessionRoomName } from './session-room.js';

type FoundationSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type FoundationSocketServer = SocketIoServer<ClientToServerEvents, ServerToClientEvents>;

export interface SocketServerOptions {
  readonly resolveSocketActorContext?: (socket: FoundationSocket) => ActorContext | null;
  readonly authorizeWatch?: (actor: ActorContext, sessionId: UUID) => boolean | Promise<boolean>;
}

function sendSocketError(socket: FoundationSocket, error: SessionErrorPayload): void {
  socket.emit('session:error', error);
}

function registerSessionWatch(server: FoundationSocketServer, options: SocketServerOptions): void {
  server.on('connection', (socket) => {
    socket.on('session:watch', (untrustedPayload) => {
      const payload = parseSessionWatchPayload(untrustedPayload);
      if (!payload) {
        sendSocketError(socket, {
          code: 'INVALID_INPUT',
          message: 'The session watch payload is invalid.',
        });
        return;
      }

      let actor: ActorContext | null;
      try {
        actor = options.resolveSocketActorContext?.(socket) ?? null;
      } catch {
        actor = null;
      }

      if (!actor) {
        sendSocketError(socket, {
          code: 'UNAUTHENTICATED',
          message: 'A verified actor context is required to watch a session.',
        });
        return;
      }

      const authorization = options.authorizeWatch?.(actor, payload.sessionId) ?? false;
      void Promise.resolve(authorization).then((allowed) => {
        if (!allowed) {
          sendSocketError(socket, {
            code: 'FORBIDDEN',
            message: 'The actor is not allowed to watch this session.',
          });
          return;
        }

        const roomName = sessionRoomName(payload.sessionId);
        void Promise.resolve(socket.join(roomName)).catch(() => {
          sendSocketError(socket, {
            code: 'INTERNAL_ERROR',
            message: 'The session watch could not be established.',
          });
        });
      });
    });
  });
}

export function createSocketServer(
  httpServer: HttpServer,
  options: SocketServerOptions = {},
): FoundationSocketServer {
  const server = new SocketIoServer<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerSessionWatch(server, options);
  return server;
}
