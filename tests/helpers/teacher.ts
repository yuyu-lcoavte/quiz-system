import { scryptSync } from 'node:crypto';
import request from 'supertest';
import { createHttpServer } from '../../apps/server/src/app.js';
import { parseTeacherConfig, type TeacherConfig } from '../../apps/server/src/modules/teacher/config.js';
import { createTeacherIntegration } from '../../apps/server/src/modules/teacher/integration.js';
import { createTeacherRepositories } from '../../apps/server/src/modules/teacher/persistence/index.js';
import { createFoundationTestContext } from './foundation.js';

/** Test-only credentials; never used outside the automated test suite. */
export const TEACHER_TEST_PASSWORD = 'teacher-test-password';
export const TEACHER_TEST_SECRET = 'teacher-test-session-secret-0123456789';
export const TEACHER_TEST_ORIGIN = 'http://127.0.0.1:5173';

let cachedHash: string | undefined;

/** Same format as `npm run teacher:hash-password`, with a fixed salt so it is computed once per test run. */
export function teacherTestPasswordHash(): string {
  if (!cachedHash) {
    const salt = Buffer.from('teacher-test-salt');
    const key = scryptSync(TEACHER_TEST_PASSWORD, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    cachedHash = `scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
  }
  return cachedHash;
}

export interface TeacherTestServerOptions {
  /** Controllable clock; defaults to real time. */
  readonly now?: () => Date;
  /** Extra or overriding environment values for the Teacher config. */
  readonly env?: Record<string, string | undefined>;
}

export function createTeacherTestServer(options: TeacherTestServerOptions = {}) {
  const foundation = createFoundationTestContext();
  const config: TeacherConfig = parseTeacherConfig({
    NODE_ENV: 'test',
    TEACHER_PASSWORD_HASH: teacherTestPasswordHash(),
    TEACHER_SESSION_SECRET: TEACHER_TEST_SECRET,
    TEACHER_ALLOWED_ORIGINS: TEACHER_TEST_ORIGIN,
    ...options.env,
  });
  const integration = createTeacherIntegration(config, { now: options.now });
  const server = createHttpServer({ database: foundation.database, ...integration });
  return {
    ...foundation,
    ...server,
    config,
    teacherRepositories: createTeacherRepositories(foundation.database),
  };
}

export type TeacherTestServer = ReturnType<typeof createTeacherTestServer>;

/** Logs in through the real Teacher API and returns the cookie and CSRF token (available once US1 auth routes exist). */
export async function loginAsTeacher(server: TeacherTestServer, password = TEACHER_TEST_PASSWORD) {
  const login = await request(server.app).post('/api/v1/teacher/auth/login').set('Origin', TEACHER_TEST_ORIGIN).send({ password });
  if (login.status !== 204) throw new Error(`Teacher test login failed with ${login.status}.`);
  const cookie = String(login.headers['set-cookie'][0]).split(';')[0];
  const me = await request(server.app).get('/api/v1/teacher/me').set('Cookie', cookie);
  return { cookie, csrfToken: me.body.data.csrfToken as string };
}
