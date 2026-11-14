import type { StudentMembershipChangedPayload } from '@quiz/contracts';
import { parseUUID, type UUID } from '@quiz/contracts/domain';
import type { LeaderFailoverService } from '../application/leader-failover-service.js';
import {
  getStudentSocketIdentity,
  type StudentEventSocket, type StudentFoundationSocket, type StudentFoundationSocketServer, type StudentSocketOptions,
} from './student-draft-socket.js';

type TeamScope = StudentMembershipChangedPayload;

export function registerStudentMembershipSockets(
  server: StudentFoundationSocketServer,
  options: StudentSocketOptions,
  failover: LeaderFailoverService,
) {
  function currentIdentity(socket: StudentFoundationSocket, sessionId: UUID) {
    const initial = getStudentSocketIdentity(socket);
    if (initial?.sessionId !== sessionId) return null;
    const current = options.resolveIdentity(socket.request.headers.cookie, sessionId);
    if (current?.credentialId !== initial.credentialId || current.actorContext.actorId !== initial.actorContext.actorId ||
        current.actorContext.actorKind !== 'participant' || current.actorContext.sessionId !== sessionId) return null;
    const participantId = parseUUID(current.actorContext.actorId);
    const teamId = parseUUID(current.actorContext.teamId);
    return participantId && teamId ? { participantId, teamId, sessionId } : null;
  }

  function* teammates(scope: TeamScope) {
    for (const socket of server.sockets.sockets.values()) {
      if (!socket.connected) continue;
      const identity = currentIdentity(socket, scope.sessionId);
      if (identity?.teamId === scope.teamId) yield { socket, participantId: identity.participantId };
    }
  }

  function publish(scope: TeamScope): void {
    try {
      for (const { socket } of teammates(scope)) {
        (socket as unknown as StudentEventSocket).emit('student:membership:changed', scope);
      }
    } catch (error) {
      console.warn('Student membership notification failed.', error instanceof Error ? error.name : 'Unknown error');
    }
  }

  function reconcile(scope: TeamScope, disconnectedParticipant?: UUID): void {
    try {
      const changed = failover.reconcile(scope, () => new Set(Array.from(teammates(scope), member => member.participantId)), disconnectedParticipant);
      if (changed) publish({ sessionId: scope.sessionId, teamId: scope.teamId });
    } catch (error) {
      console.warn('Student leader reconciliation failed.', error instanceof Error ? error.name : 'Unknown error');
    }
  }

  server.on('connection', socket => {
    const initial = getStudentSocketIdentity(socket);
    if (!initial) return;
    const scope = currentIdentity(socket, initial.sessionId);
    if (!scope) return;
    socket.once('disconnect', () => {
      // A moved Participant's live membership determines the affected Team.
      try {
        const affected = currentIdentity(socket, initial.sessionId) ?? scope;
        reconcile(affected, affected.participantId);
      } catch (error) {
        console.warn('Student disconnect identity check failed.', error instanceof Error ? error.name : 'Unknown error');
      }
    });
    reconcile(scope);
  });

  return { publish, reconcile };
}
