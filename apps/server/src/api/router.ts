import express, { Router, type Router as ExpressRouter } from 'express';
import { actorContextMiddleware, type ActorContextResolver } from './middleware/actor-context.js';
import type Database from 'better-sqlite3';
import { createSessionRouter } from '../modules/sessions/api/session-router.js';
import { SessionQueryService } from '../modules/sessions/application/session-query-service.js';
import type { ActivityCodeRateLimitOptions } from './middleware/activity-code-rate-limit.js';

export interface ApiRouterOptions {
  readonly resolveActorContext?: ActorContextResolver;
  readonly database?: Database.Database;
  readonly activityCodeRateLimit?: ActivityCodeRateLimitOptions;
  readonly studentRouter?: ExpressRouter;
  readonly teacherRouter?: ExpressRouter;
}

export function createApiRouter(options: ApiRouterOptions = {}) {
  const router = Router();
  router.use(express.json());
  router.use(actorContextMiddleware(options.resolveActorContext));
  if (options.database) {
    router.use(createSessionRouter({
      query: new SessionQueryService(options.database),
      activityCodeRateLimit: options.activityCodeRateLimit,
    }));
  }
  router.use('/student', options.studentRouter ?? Router());
  if (options.teacherRouter) router.use('/teacher', options.teacherRouter);
  return router;
}
