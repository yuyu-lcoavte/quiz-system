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
  type StudentDraftLockedPayload,
} from '@quiz/contracts';
import { assertStudentOrigin } from '../../../api/middleware/student-origin.js';
import { HttpError } from '../../../errors/http-error.js';
import type { StudentResolvedIdentity } from '../application/student-identity-service.js';
import { studentDraftRoomName, studentDraftRoomScope } from './student-draft-room.js';
import type { DraftService } from '../application/draft-service.js';
import type { StudentCsrfService } from '../../../api/middleware/student-csrf.js';

export type StudentFoundationSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type StudentFoundationSocketServer = SocketIoServer<ClientToServerEvents, ServerToClientEvents>;
export type StudentEventSocket = Socket<StudentClientToServerEvents, StudentServerToClientEvents>;

export interface StudentSocketOptions {
  readonly draftService?:DraftService;
  readonly csrf?:StudentCsrfService;
  readonly allowedOrigins: readonly string[];
  readonly resolveIdentity: (cookieHeader: string | undefined, sessionId: UUID) => StudentResolvedIdentity | null;
}

export interface StudentSocketIdentity extends StudentResolvedIdentity { readonly sessionId: UUID; }

/** Called only after the submission transaction commits; recheck each recipient. */
export function publishStudentDraftLock(server: StudentFoundationSocketServer, options: StudentSocketOptions | undefined, teamId: UUID, lock: StudentDraftLockedPayload): void {
  for (const socket of server.sockets.sockets.values()) {
    try {
      const identity = options?.resolveIdentity(socket.request.headers.cookie, lock.sessionId);
      const scope = getStudentSocketIdentity(socket);
      const room = identity ? studentDraftRoomName(identity.actorContext, lock.roundId) : null;
      if (scope?.sessionId === lock.sessionId && identity?.actorContext.teamId === teamId && room && socket.rooms.has(room)) {
        (socket as unknown as StudentEventSocket).emit('student:draft:locked', lock);
      }
    } catch { /* An invalid recipient must not prevent delivery to other authorized members. */ }
  }
}

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
    const trusted=(sessionId:UUID)=>{
      assertStudentOrigin(socket.handshake.headers.origin,options!.allowedOrigins);
      const current=options!.resolveIdentity(socket.request.headers.cookie,sessionId);
      const initial=getStudentSocketIdentity(foundationSocket);
      if(!current||initial?.sessionId!==sessionId)throw new HttpError(401,'UNAUTHENTICATED','Student identity is invalid.');
      return current;
    };
    const fail=(error:unknown)=>socket.emit('student:draft:error',error instanceof HttpError?{code:error.code,message:error.message}:{code:'INTERNAL_ERROR',message:'Draft operation failed.'});
    socket.on('student:draft:watch', (untrustedPayload) => {
      const payload = parseStudentDraftWatchPayload(untrustedPayload);
      if (!payload) {
        socket.emit('student:draft:error', { code: 'INVALID_INPUT', message: 'The Student draft watch payload is invalid.' });
        return;
      }
      if(options?.draftService){void(async()=>{try{
        const identity=trusted(payload.sessionId);
        const snapshot=options.draftService!.snapshot(identity.actorContext,payload.sessionId,payload.roundId);
        for(const room of socket.rooms)if(room.startsWith('student:team:'))await socket.leave(room);
        await socket.join(studentDraftRoomName(identity.actorContext,payload.roundId)!);
        const current=trusted(payload.sessionId);
        if(current.actorContext.teamId!==identity.actorContext.teamId)throw new HttpError(403,'FORBIDDEN','Membership changed.');
        socket.emit('student:draft:snapshot',options.draftService!.snapshot(current.actorContext,payload.sessionId,payload.roundId));
      }catch(error){for(const room of socket.rooms)if(room.startsWith('student:team:'))await socket.leave(room);fail(error);}})();}
      else handlers.onWatch?.(socket, payload);
    });
    socket.on('student:draft:edit', (untrustedPayload) => {
      const payload = parseStudentDraftEditPayload(untrustedPayload);
      if (!payload) {
        socket.emit('student:draft:error', { code: 'INVALID_INPUT', message: 'The Student draft edit payload is invalid.' });
        return;
      }
      if(options?.draftService){try{
        const identity=trusted(payload.sessionId);
        if(!options.csrf?.verify(payload.csrfToken,{credentialId:identity.credentialId,sessionId:payload.sessionId}))throw new HttpError(403,'FORBIDDEN','Valid CSRF token required.');
        const change=options.draftService.edit(identity.actorContext,payload.sessionId,payload.roundId,payload);
        socket.emit('student:draft:changed',change);
      }catch(error){fail(error);}}
      else handlers.onEdit?.(socket, payload);
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

