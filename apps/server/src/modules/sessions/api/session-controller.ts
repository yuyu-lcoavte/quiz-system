import type { RequestHandler } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import { HttpError } from '../../../errors/http-error.js';
import type { SessionQueryService } from '../application/session-query-service.js';

function sessionIdFrom(request: Parameters<RequestHandler>[0]) {
  const value = request.params.sessionId;
  const sessionId = typeof value === 'string' ? parseUUID(value) : null;
  if (!sessionId) throw new HttpError(400, 'INVALID_INPUT', 'Session ID must be a UUID.');
  return sessionId;
}

function requireScope(actor: ActorContext | null | undefined, sessionId: string): ActorContext {
  if (!actor) throw new HttpError(401, 'UNAUTHENTICATED', 'A verified actor context is required.');
  if (actor.sessionId !== sessionId) throw new HttpError(403, 'FORBIDDEN', 'The actor is not authorized for this Session.');
  return actor;
}

function requirePermission(actor: ActorContext, permission: string) {
  if (!actor.permissions.includes(permission)) throw new HttpError(403, 'FORBIDDEN', 'The actor lacks the required permission.');
}

function requireParticipantScope(actor: ActorContext, sessionId: ReturnType<typeof parseUUID>, query: SessionQueryService) {
  if (actor.actorKind === 'participant' && (!actor.teamId || !sessionId || !query.isTeamInSession(actor.teamId, sessionId))) {
    throw new HttpError(403, 'FORBIDDEN', 'A verified team context for this Session is required.');
  }
}

function handle(operation: (request: Parameters<RequestHandler>[0]) => unknown): RequestHandler {
  return (request, response, next) => {
    try { response.json({ data: operation(request) }); } catch (error) { next(error); }
  };
}

export function createSessionController(query: SessionQueryService) {
  return {
    lookupActivityCode: handle((req) => query.lookupActivityCode(String(req.params.activityCode))),
    getSession: handle((req) => {
      const id = sessionIdFrom(req); const session = query.getSession(id);
      const actor = requireScope(req.actorContext, id); requirePermission(actor, 'session:read');
      return session;
    }),
    getState: handle((req) => {
      const id = sessionIdFrom(req); const state = query.getState(id);
      const actor = requireScope(req.actorContext, id); requirePermission(actor, 'session:read');
      return state;
    }),
    getCurrentTarget: handle((req) => {
      const id = sessionIdFrom(req); const state = query.getState(id);
      const actor = requireScope(req.actorContext, id); requireParticipantScope(actor, id, query);
      if (!state.currentRoundId) return null;
      if (actor.actorKind === 'participant') {
        if (state.phase !== 'Active') throw new HttpError(403, 'FORBIDDEN', 'Participants can read the current target only while Active.');
        requirePermission(actor, 'target:read');
      } else if (state.phase === 'Waiting') requirePermission(actor, 'target:preview');
      else requirePermission(actor, 'target:read');
      return query.getCurrentTarget(id);
    }),
    getResults: handle((req) => {
      const id = sessionIdFrom(req); const state = query.getState(id);
      const actor = requireScope(req.actorContext, id); requireParticipantScope(actor, id, query);
      if (actor.actorKind === 'participant' && state.phase !== 'Ended') throw new HttpError(403, 'FORBIDDEN', 'Participants can read results only after the Round has ended.');
      requirePermission(actor, 'results:read');
      return query.getResults(id);
    }),
  };
}
