import type { Server as HttpServer } from 'node:http';
import { Server as SocketIoServer, type Socket } from 'socket.io';
import type { ActorContext } from '@quiz/contracts/identity';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { registerSessionEvents } from './session-events.js';

type FoundationSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type FoundationSocketServer = SocketIoServer<ClientToServerEvents, ServerToClientEvents>;

export interface SocketServerOptions {
  readonly resolveSocketActorContext?: (socket: FoundationSocket) => ActorContext | null;
  readonly authorizeWatch?: (actor: ActorContext, sessionId: UUID) => boolean | Promise<boolean>;
  readonly getSessionState?: (sessionId: UUID) => SessionStateSnapshot | null | Promise<SessionStateSnapshot | null>;
}

export function createSocketServer(httpServer: HttpServer, options: SocketServerOptions = {}): FoundationSocketServer {
  const server = new SocketIoServer<ClientToServerEvents, ServerToClientEvents>(httpServer);
  registerSessionEvents(server, options);
  return server;
}
