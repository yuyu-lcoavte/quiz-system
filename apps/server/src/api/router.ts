import express, { Router } from 'express';
import { actorContextMiddleware, type ActorContextResolver } from './middleware/actor-context.js';

export interface ApiRouterOptions {
  readonly resolveActorContext?: ActorContextResolver;
}

export function createApiRouter(options: ApiRouterOptions = {}) {
  const router = Router();
  router.use(express.json());
  router.use(actorContextMiddleware(options.resolveActorContext));
  return router;
}
