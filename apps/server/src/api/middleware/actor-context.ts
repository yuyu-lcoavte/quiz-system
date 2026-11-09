import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import { HttpError } from '../../errors/http-error.js';

declare global {
  namespace Express {
    interface Request {
      actorContext?: ActorContext | null;
    }
  }
}

export type ActorContextResolver = (request: Request) => ActorContext | null;

function isActorContext(value: unknown): value is ActorContext {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ActorContext>;
  return (
    (candidate.actorKind === 'teacher' || candidate.actorKind === 'participant') &&
    typeof candidate.actorId === 'string' &&
    candidate.actorId.length > 0 &&
    Array.isArray(candidate.permissions) &&
    candidate.permissions.every((permission) => typeof permission === 'string') &&
    (candidate.sessionId === undefined || parseUUID(candidate.sessionId) !== null) &&
    (candidate.teamId === undefined || parseUUID(candidate.teamId) !== null)
  );
}

/** Resolver is supplied by trusted server middleware; request headers are never identity. */
export function actorContextMiddleware(
  resolver: ActorContextResolver = () => null,
): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      const actorContext = resolver(request);
      if (actorContext !== null && !isActorContext(actorContext)) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'A verified actor context is required.');
      }
      request.actorContext = actorContext;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireActorContext: RequestHandler = (request, _response, next) => {
  if (!request.actorContext) {
    next(new HttpError(401, 'UNAUTHENTICATED', 'A verified actor context is required.'));
    return;
  }
  next();
};
