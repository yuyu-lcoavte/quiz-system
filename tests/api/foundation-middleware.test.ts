import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '@quiz/contracts/identity';
import { createApiRouter } from '../../apps/server/src/api/router.js';
import { actorContextMiddleware, requireActorContext } from '../../apps/server/src/api/middleware/actor-context.js';
import { validateRequest } from '../../apps/server/src/api/middleware/validate.js';
import { errorHandler, notFoundHandler } from '../../apps/server/src/errors/error-handler.js';
import { HttpError } from '../../apps/server/src/errors/http-error.js';
import { createTestActorContextResolver } from '../helpers/actor-context.js';

const actor: ActorContext = {
  actorKind: 'teacher',
  actorId: '0a84bdce-7844-4c70-89ec-489d4dc7507f',
  permissions: ['foundation:test'],
};

function createProtectedTestApp(resolveActorContext?: (req: express.Request) => ActorContext | null) {
  const app = express();
  const api = createApiRouter({ resolveActorContext });
  api.get('/protected', requireActorContext, (_req, res) => res.json({ data: 'authorized' }));
  api.get(
    '/validated',
    validateRequest((req) => {
      if (req.query.value !== 'accepted') {
        throw new HttpError(400, 'INVALID_INPUT', 'The request value is invalid.');
      }
    }),
    (_req, res) => res.json({ data: 'valid' }),
  );
  api.get('/explode', () => {
    throw new Error('do not expose internal details');
  });
  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe('Foundation HTTP middleware seams', () => {
  it('rejects protected requests without a verified server ActorContext', async () => {
    const response = await request(createProtectedTestApp()).get('/api/v1/protected');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('does not derive identity from client-supplied role or team headers', async () => {
    const response = await request(createProtectedTestApp())
      .get('/api/v1/protected')
      .set('x-actor-kind', 'teacher')
      .set('x-team-id', actor.actorId);

    expect(response.status).toBe(401);
  });

  it('accepts a test-only injected server context in the test environment', async () => {
    const resolver = createTestActorContextResolver(actor);
    const response = await request(createProtectedTestApp(resolver)).get('/api/v1/protected');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: 'authorized' });
  });

  it('refuses to create a test ActorContext resolver outside the test environment', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => createTestActorContextResolver(actor)).toThrow(/NODE_ENV=test/);
    vi.unstubAllEnvs();
  });

  it('maps validation errors to the common envelope', async () => {
    const response = await request(createProtectedTestApp()).get('/api/v1/validated?value=wrong');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'INVALID_INPUT' });
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });

  it('returns a sanitized common 500 envelope for unexpected failures', async () => {
    const response = await request(createProtectedTestApp()).get('/api/v1/explode');

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(response.body)).not.toContain('do not expose internal details');
  });

  it('uses the common envelope for unmatched API routes', async () => {
    const response = await request(createProtectedTestApp()).get('/api/v1/not-found');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'TARGET_NOT_FOUND' });
  });

  it('creates a mountable API router with JSON request support', async () => {
    const handler: RequestHandler = (req, res) => res.json({ body: req.body });
    const app = express();
    const api = createApiRouter();
    api.post('/echo', handler);
    app.use('/api/v1', api);
    app.use(errorHandler);

    const response = await request(app).post('/api/v1/echo').send({ ok: true });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ body: { ok: true } });
  });

  it('runs the actor resolver once per request', async () => {
    const resolver = vi.fn(() => null);
    await request(createProtectedTestApp(resolver)).get('/api/v1/protected');
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
