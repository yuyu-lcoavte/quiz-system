import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createStudentCsrfService, createStudentCsrfMiddleware, setStudentCsrfNoStore, verifyStudentSocketMutationCsrf } from '../../apps/server/src/api/middleware/student-csrf.js';
import { assertStudentOrigin, createStudentOriginGuard, createStudentOriginMiddleware } from '../../apps/server/src/api/middleware/student-origin.js';
import { HttpError } from '../../apps/server/src/errors/http-error.js';
import { parseUUID } from '@quiz/contracts/domain';
import type { UUID } from '@quiz/contracts/domain';

const sessionId = parseUUID('00000000-0000-4000-8000-000000000001')!;
const credentialId = '00000000-0000-4000-8000-000000000101';
const secret = 'a'.repeat(64);
const origin = 'http://127.0.0.1:5173';

describe('Student Origin and CSRF foundation', () => {
  it('allows only an exact configured HTTP Origin', () => {
    const guard = createStudentOriginGuard([origin]);
    expect(() => guard({ origin })).not.toThrow();
    for (const invalid of [undefined, 'null', 'not a url', 'http://127.0.0.1:5173/', 'http://localhost:5173']) {
      expect(() => guard({ origin: invalid })).toThrow(HttpError);
    }
  });

  it('uses the same strict Origin validation for Socket.IO handshakes', () => {
    expect(() => assertStudentOrigin(origin, [origin])).not.toThrow();
    expect(() => assertStudentOrigin(undefined, [origin])).toThrow(HttpError);
    expect(() => assertStudentOrigin('null', [origin])).toThrow(HttpError);
    expect(() => assertStudentOrigin(origin, [origin, 'bad-config'])).toThrow(/STUDENT_ALLOWED_ORIGINS/);
  });

  it('accepts a session-bound CSRF token and rejects missing, expired, modified, and wrong-Session tokens', () => {
    let now = 1_800_000_000_000;
    const csrf = createStudentCsrfService({ secret, now: () => now, ttlMs: 1_000 });
    const token = csrf.issue({ credentialId, sessionId });
    expect(csrf.verify(token, { credentialId, sessionId })).toBe(true);
    expect(csrf.verify('', { credentialId, sessionId })).toBe(false);
    expect(csrf.verify(`${token}x`, { credentialId, sessionId })).toBe(false);
    expect(csrf.verify(token, { credentialId, sessionId: parseUUID('00000000-0000-4000-8000-000000000002')! })).toBe(false);
    now += 1_001;
    expect(csrf.verify(token, { credentialId, sessionId })).toBe(false);
  });

  it('rejects an absent or too-short signing secret at service creation', () => {
    expect(() => createStudentCsrfService({ secret: '' })).toThrow(/STUDENT_CSRF_SECRET/);
    expect(() => createStudentCsrfService({ secret: 'short' })).toThrow(/STUDENT_CSRF_SECRET/);
  });

  it('requires the session-bound token for a Student Socket.IO mutation', () => {
    const csrf = createStudentCsrfService({ secret });
    const token = csrf.issue({ credentialId, sessionId });
    const identity = { credentialId, actorContext: { actorKind: 'participant', sessionId } };
    expect(verifyStudentSocketMutationCsrf(csrf, token, identity, sessionId)).toBe(true);
    expect(verifyStudentSocketMutationCsrf(csrf, undefined, identity, sessionId)).toBe(false);
    expect(verifyStudentSocketMutationCsrf(csrf, token, { ...identity, actorContext: { actorKind: 'teacher', sessionId } }, sessionId)).toBe(false);
    expect(verifyStudentSocketMutationCsrf(csrf, token, identity, parseUUID('00000000-0000-4000-8000-000000000002') as UUID)).toBe(false);
  });

  it('marks CSRF token read responses as non-cacheable', () => {
    const headers: Record<string, string> = {};
    setStudentCsrfNoStore({ setHeader: (name: string, value: string) => { headers[name] = value; } } as never);
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('protects a state-changing HTTP route with both trusted Origin and a valid session CSRF token', async () => {
    const csrf = createStudentCsrfService({ secret });
    const token = csrf.issue({ credentialId, sessionId });
    const app = express();
    app.use((req, _res, next) => { req.studentCredentialId = credentialId; next(); });
    app.post('/sessions/:sessionId/change', createStudentOriginMiddleware([origin]), createStudentCsrfMiddleware(csrf), (_req, res) => res.json({ data: { ok: true } }));

    const valid = await request(app).post(`/sessions/${sessionId}/change`).set('Origin', origin).set('X-CSRF-Token', token);
    expect(valid.status).toBe(200);
    for (const headers of [
      { 'Origin': origin },
      { 'X-CSRF-Token': token },
      { 'Origin': 'null', 'X-CSRF-Token': token },
    ]) {
      expect((await request(app).post(`/sessions/${sessionId}/change`).set(headers)).status).toBe(403);
    }
  });
});
