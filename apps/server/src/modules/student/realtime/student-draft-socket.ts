import type { Server as SocketIoServer, Socket } from 'socket.io';
import type { ActorContext } from '@quiz/contracts/identity';
import { parseUUID, type UUID } from '@quiz/contracts/domain';
import type { ClientToServerEvents, ServerToClientEvents } from '@quiz/contracts/realtime';
import {
  parseStudentDraftEditPayload,
  parseStudentDraftWatchPayload,
  type StudentDraftEditPayload,
  type StudentDraftWatchPayload,
  type StudentClientToServerEvents,
  type StudentServerToClientEvents,
} from '@quiz/contracts';
import { assertStudentOrigin } from '../../../api/middleware/student-origin.js';
import { HttpError } from '../../../errors/http-error.js';
import type { StudentResolvedIdentity } from '../application/student-identity-service.js';
import { studentDraftRoomName, studentDraftRoomScope } from './student-draft-room.js';

export type StudentFoundationSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type StudentFoundationSocketServer = SocketIoServer<ClientToServerEvents, ServerToClientEvents>;
export type StudentEventSocket = Socket<StudentClientToServerEvents, StudentServerToClientEvents>;

export interface StudentSocketOptions {
  readonly allowedOrigins: readonly string[];
  readonly resolveIdentity: (cookieHeader: string | undefined, sessionId: UUID) => StudentResolvedIdentity | null;
}

export interface StudentSocketIdentity extends StudentResolvedIdentity { readonly sessionId: UUID; }

export interface StudentDraftSocketHandlers {
  readonly onWatch?: (socket: StudentEventSocket, payload: StudentDraftWatchPayload) => void;
  readonly onEdit?: (socket: StudentEventSocket, payload: StudentDraftEditPayload) => void;
}

export function getStudentSocketIdentity(socket: StudentFoundationSocket): StudentSocketIdentity | null {
  return (socket.data as { studentIdentity?: StudentSocketIdentity }).studentIdentity ?? null;
}

/** Installs the Student handshake authorization seam on the shared Foundation Socket.IO server. */
export function registerStudentDraftSocket(server: StudentFoundationSocketServer, options?: StudentSocketOptions, handlers: StudentDraftSocketHandlers = {}): void {
  if (options) server.use((socket, next) => {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;
    const requested = auth?.sessionId;
    if (requested === undefined) {
      next(); // Existing non-Student/Foundation clients retain their existing authentication seam.
      return;
    }
    const sessionId = parseUUID(requested);
    if (!sessionId) {
      next(new Error('INVALID_STUDENT_SCOPE'));
      return;
    }
    try {
      assertStudentOrigin(socket.handshake.headers.origin, options.allowedOrigins);
      const resolved = options.resolveIdentity(socket.request.headers.cookie, sessionId);
      if (!resolved || resolved.actorContext.actorKind !== 'participant' || resolved.actorContext.sessionId !== sessionId || !resolved.actorContext.teamId) {
        next(new Error('UNAUTHENTICATED_STUDENT'));
        return;
      }
      (socket.data as { studentIdentity?: StudentSocketIdentity }).studentIdentity = { ...resolved, sessionId };
      next();
    } catch {
      next(new Error('UNAUTHORIZED_STUDENT_ORIGIN'));
    }
  });

  server.on('connection', (foundationSocket) => {
    const socket = foundationSocket as unknown as StudentEventSocket;
    if (!getStudentSocketIdentity(foundationSocket)) return;
    socket.on('student:draft:watch', (untrustedPayload) => {
      const payload = parseStudentDraftWatchPayload(untrustedPayload);
      if (!payload) {
        socket.emit('student:draft:error', { code: 'INVALID_INPUT', message: 'The Student draft watch payload is invalid.' });
        return;
      }
      handlers.onWatch?.(socket, payload);
    });
    socket.on('student:draft:edit', (untrustedPayload) => {
      const payload = parseStudentDraftEditPayload(untrustedPayload);
      if (!payload) {
        socket.emit('student:draft:error', { code: 'INVALID_INPUT', message: 'The Student draft edit payload is invalid.' });
        return;
      }
      handlers.onEdit?.(socket, payload);
    });
  });
}

/** Validates a requested Team/Round scope without accepting a client room name or Team ID. */
export function getAuthorizedStudentDraftRoom(actor: ActorContext, sessionId: string, roundId: string): string | null {
  if (actor.sessionId !== sessionId || !studentDraftRoomScope(actor, roundId)) return null;
  return studentDraftRoomName(actor, roundId);
}

export function validateStudentSocketScope(sessionId: unknown): UUID {
  const parsed = parseUUID(sessionId);
  if (!parsed) throw new HttpError(400, 'INVALID_INPUT', 'Session ID must be a UUID.');
  return parsed;
}

