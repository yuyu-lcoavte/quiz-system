import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketServer } from 'socket.io';
import { afterEach, describe, expect, it } from 'vitest';
import { parseUUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import {
  createSocketServer,
  type SocketServerOptions,
} from '../../apps/server/src/realtime/socket-server.js';
import { sessionRoomName } from '../../apps/server/src/realtime/session-room.js';
import { createTestActorContextResolver } from '../helpers/actor-context.js';

const sessionId = parseUUID('af94dbac-a627-4b90-9ce1-f9d2cfedc391')!;

function nextClientEvent(client: ClientSocket, eventName: string): Promise<unknown[]> {
  return new Promise((resolve) => client.once(eventName as never, (...args: unknown[]) => resolve(args)));
}

describe('Socket.IO session watch boundary', () => {
  const clients: ClientSocket[] = [];
  const servers: Array<{ httpServer: ReturnType<typeof createServer>; io: SocketServer }> = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve) => server.io.close(() => resolve()));
    }
  });

  async function startSocketServer(options: SocketServerOptions) {
    const httpServer = createServer();
    const io = createSocketServer(httpServer, options);
    servers.push({ httpServer, io });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const { port } = httpServer.address() as AddressInfo;
    const client = createClient(`http://127.0.0.1:${port}`, { timeout: 3000 });
    clients.push(client);
    await nextClientEvent(client, 'connect');
    return { client, io };
  }

  it('rejects unauthenticated watches and does not join a room', async () => {
    const { client, io } = await startSocketServer({});
    const error = nextClientEvent(client, 'session:error');

    client.emit('session:watch', { sessionId });

    const [payload] = await error;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(payload).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(io.sockets.adapter.rooms.has(sessionRoomName(sessionId))).toBe(false);
  });

  it('rejects malformed watch payloads without joining any room', async () => {
    const { client, io } = await startSocketServer({});
    const error = nextClientEvent(client, 'session:error');

    client.emit('session:watch', { room: `session:${sessionId}` });

    const [payload] = await error;
    expect(payload).toMatchObject({ code: 'INVALID_INPUT' });
    expect(io.sockets.adapter.rooms.has(sessionRoomName(sessionId))).toBe(false);
  });

  it('joins only the server-computed room after the trusted authorizer allows it', async () => {
    const actor: ActorContext = {
      actorKind: 'participant',
      actorId: '18fd74d7-9f14-4bca-8bdb-66d9dfce3a23',
      sessionId,
      teamId: parseUUID('9ad6da0f-a0a7-420a-86c6-2cbb4911bf53')!,
      permissions: [],
    };
    const options: SocketServerOptions = {
      resolveSocketActorContext: createTestActorContextResolver(actor),
      authorizeWatch: (resolvedActor, requestedSessionId) =>
        resolvedActor.actorKind === 'participant' && resolvedActor.sessionId === requestedSessionId,
      getSessionState: (requestedSessionId) => ({
        sessionId: requestedSessionId, phase: 'Waiting', currentRoundId: null, target: null,
        stateVersion: 0, changedAt: '2026-11-09T01:00:00.000Z',
      }),
    };
    const { client, io } = await startSocketServer(options);
    const watchError = nextClientEvent(client, 'session:error').then(([payload]) => payload);

    client.emit('session:watch', { sessionId });
    const errorPayload = await Promise.race([
      watchError,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const serverSocket = [...io.sockets.sockets.values()][0];
    expect(errorPayload).toBeNull();
    expect(serverSocket.rooms.has(sessionRoomName(sessionId))).toBe(true);
    expect(serverSocket.rooms.has(`client-selected:${sessionId}`)).toBe(false);
  });
});
