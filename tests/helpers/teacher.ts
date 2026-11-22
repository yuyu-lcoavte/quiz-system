import { randomUUID } from 'node:crypto';
import type { UUID } from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../apps/server/src/persistence/repositories/index.js';
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

/** Same format as `npm run teacher:hash-password` but N=1024 (fast tests) and a fixed salt; production hashes use N=32768. */
export function teacherTestPasswordHash(): string {
  if (!cachedHash) {
    const salt = Buffer.from('teacher-test-salt');
    const key = scryptSync(TEACHER_TEST_PASSWORD, salt, 64, { N: 1024, r: 8, p: 1 });
    cachedHash = `scrypt$1024$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
  }
  return cachedHash;
}

export interface TeacherTestServerOptions {
  /** Controllable clock; defaults to real time. */
  readonly now?: () => Date;
  /** Extra or overriding environment values for the Teacher config. */
  readonly env?: Record<string, string | undefined>;
  /** Also enable the Student routes and Student Socket handshake (needed for join/submit flows). */
  readonly withStudents?: boolean;
}

export const STUDENT_TEST_SECRET = 'student-test-secret-'.repeat(3);

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
  const server = createHttpServer({
    database: foundation.database,
    ...integration,
    ...(options.withStudents ? { studentSecurity: { secret: STUDENT_TEST_SECRET, allowedOrigins: [TEACHER_TEST_ORIGIN] } } : {}),
  });
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

export interface TeacherAuth { readonly cookie: string; readonly csrfToken: string }

/** Thin Teacher API client for tests: cookie on every call, Origin + CSRF on mutations. */
export function teacherApi(server: TeacherTestServer, auth: TeacherAuth) {
  const base = '/api/v1/teacher';
  return {
    get: (path: string) => request(server.app).get(`${base}${path}`).set('Cookie', auth.cookie),
    post: (path: string, body: object = {}) => request(server.app).post(`${base}${path}`)
      .set('Cookie', auth.cookie).set('Origin', TEACHER_TEST_ORIGIN).set('X-CSRF-Token', auth.csrfToken).send(body),
  };
}

export interface SeededTargets {
  readonly group1: UUID; readonly group2: UUID; readonly question3: UUID; readonly question4: UUID;
  /** Questions inside the groups, in row order. */
  readonly group1Questions: readonly UUID[]; readonly group2Questions: readonly UUID[];
  readonly blanks: Readonly<Record<string, readonly UUID[]>>;
}

/**
 * Test data shaped like the question-group template: 1 and 2 are groups of two one-blank questions,
 * 3 and 4 are single one-blank questions. Targets share one position sequence 0..3.
 */
export function seedQuestionGroupTargets(server: TeacherTestServer, sessionId: UUID): SeededTargets {
  const repositories = createFoundationRepositories(server.database);
  const blanks: Record<string, UUID[]> = {};
  const addQuestion = (number: string, position: number, groupId: UUID | null, labels: (string | null)[]) => {
    const id = randomUUID() as UUID;
    repositories.questions.create({ id, sessionId, questionGroupId: groupId, displayNumber: number, prompt: null, position });
    blanks[id] = labels.map((label, index) => {
      const blankId = randomUUID() as UUID;
      repositories.blanks.create({ id: blankId, questionId: id, label, position: index });
      return blankId;
    });
    return id;
  };
  const group1 = randomUUID() as UUID;
  const group2 = randomUUID() as UUID;
  repositories.questionGroups.create({ id: group1, sessionId, label: '1', position: 0 });
  const group1Questions = [addQuestion('1', 0, group1, ['（1）']), addQuestion('1', 1, group1, ['（2）'])];
  repositories.questionGroups.create({ id: group2, sessionId, label: '2', position: 1 });
  const group2Questions = [addQuestion('2', 0, group2, ['（1）']), addQuestion('2', 1, group2, ['（2）'])];
  const question3 = addQuestion('3', 2, null, [null]);
  const question4 = addQuestion('4', 3, null, [null]);
  return { group1, group2, question3, question4, group1Questions, group2Questions, blanks };
}

/** Creates an activity through the Teacher API and returns its detail view. */
export async function createActivity(server: TeacherTestServer, auth: TeacherAuth, teamCount = 2) {
  const created = await teacherApi(server, auth).post('/sessions', { teamCount });
  if (created.status !== 201) throw new Error(`Create activity failed with ${created.status}.`);
  return created.body.data as { sessionId: UUID; activityCode: string };
}
