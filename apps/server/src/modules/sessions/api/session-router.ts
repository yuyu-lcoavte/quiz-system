import { Router } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';
import { requireActorContext } from '../../../api/middleware/actor-context.js';
import { validateRequest } from '../../../api/middleware/validate.js';
import { createActivityCodeRateLimiter, type ActivityCodeRateLimitOptions } from '../../../api/middleware/activity-code-rate-limit.js';
import type { SessionQueryService } from '../application/session-query-service.js';
import { createSessionController } from './session-controller.js';

export interface SessionRouterOptions { query: SessionQueryService; activityCodeRateLimit?: ActivityCodeRateLimitOptions; }

export function createSessionRouter(options: SessionRouterOptions) {
  const router = Router();
  const controller = createSessionController(options.query);
  const rateLimit = createActivityCodeRateLimiter(options.activityCodeRateLimit ?? { maxRequests: 30, windowMs: 60_000 });
  router.get('/sessions/by-code/:activityCode', rateLimit, validateRequest((req) => {
    const value = req.params.activityCode;
    const code = typeof value === 'string' ? value.trim() : '';
    if (!code || code.length > 64 || /[\u0000-\u001f\u007f]/.test(code)) throw new HttpError(400, 'INVALID_INPUT', 'Activity Code is invalid.');
    req.params.activityCode = code.toUpperCase();
  }), controller.lookupActivityCode);
  router.get('/sessions/:sessionId', requireActorContext, validateRequest((req) => controllerSessionId(req.params.sessionId)), controller.getSession);
  router.get('/sessions/:sessionId/state', requireActorContext, validateRequest((req) => controllerSessionId(req.params.sessionId)), controller.getState);
  router.get('/sessions/:sessionId/current-target', requireActorContext, validateRequest((req) => controllerSessionId(req.params.sessionId)), controller.getCurrentTarget);
  router.get('/sessions/:sessionId/results', requireActorContext, validateRequest((req) => controllerSessionId(req.params.sessionId)), controller.getResults);
  return router;
}

function controllerSessionId(value: unknown) {
  if (!parseUUID(value)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Session ID must be a UUID.');
  }
}
