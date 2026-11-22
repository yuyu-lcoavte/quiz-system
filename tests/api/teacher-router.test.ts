import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createHttpServer, type TeacherServiceDependencies } from '../../apps/server/src/app.js';
import { createTeacherIntegration } from '../../apps/server/src/modules/teacher/integration.js';
import { parseTeacherConfig } from '../../apps/server/src/modules/teacher/config.js';
import { createFoundationTestContext, ids, session } from '../helpers/foundation.js';
import { createTeacherTestServer, TEACHER_TEST_PASSWORD } from '../helpers/teacher.js';

describe('Teacher router composition', () => {
  it('builds the router from the reserved services hook and does not install a global actor resolver', () => {
    const context = createFoundationTestContext();
    const integration = createTeacherIntegration(parseTeacherConfig({ NODE_ENV: 'test' }));
    expect(typeof integration.createTeacherRouter).toBe('function');
    expect(integration.resolveActorContext).toBeUndefined();

    let received: TeacherServiceDependencies | undefined;
    createHttpServer({
      database: context.database,
      createTeacherRouter: (services) => { received = services; return integration.createTeacherRouter!(services); },
    });
    expect(received?.database).toBe(context.database);
    expect(received?.sessionLifecycle).toBeDefined();
    expect(received?.endCoordinator).toBeDefined();
  });

  it('mounts under /api/v1/teacher and answers unknown Teacher paths with the shared 404 envelope', async () => {
    const { app } = createTeacherTestServer();
    const response = await request(app).get('/api/v1/teacher/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TARGET_NOT_FOUND');
  });

  it('gives no identity on shared Session reads to a request without a Student credential', async () => {
    const { app, repositories } = createTeacherTestServer();
    repositories.sessions.create(session());
    const response = await request(app).get(`/api/v1/sessions/${ids.session1}/state`);
    expect(response.status).toBe(401);
  });

  it('exposes a fixed test password that is never the stored hash', () => {
    const { config } = createTeacherTestServer();
    expect(config.configured).toBe(true);
    expect(config.passwordHash).toMatch(/^scrypt\$/);
    expect(config.passwordHash).not.toContain(TEACHER_TEST_PASSWORD);
  });
});
