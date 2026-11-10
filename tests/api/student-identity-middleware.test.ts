import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createStudentIdentityMiddleware } from '../../apps/server/src/api/middleware/student-identity.js';
import { StudentIdentityService, hashStudentSessionToken } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { requireActorContext } from '../../apps/server/src/api/middleware/actor-context.js';
import { createFoundationTestContext, ids, TIME } from '../helpers/foundation.js';

const token = 'opaque-student-token-which-is-long-enough-for-a-test-only-fixture';
const extra = { credentialId: '00000000-0000-4000-8000-000000000301' };

function fixture(options: { expiresAt?: string; revokedAt?: string | null; mappedSession?: string } = {}) {
  const context = createFoundationTestContext();
  const db = context.database;
  context.repositories.sessions.create({ id: ids.session1, activityCode: 'IDENTITY-1', currentRoundId: null, stateVersion: 0, createdAt: TIME });
  context.repositories.sessions.create({ id: ids.session2, activityCode: 'IDENTITY-2', currentRoundId: null, stateVersion: 0, createdAt: TIME });
  context.repositories.teams.create({ id: ids.team1, sessionId: ids.session1, name: 'Team A', createdAt: TIME });
  context.repositories.participants.create({ id: ids.participant1, teamId: ids.team1, displayName: 'Learner', createdAt: TIME });
  const student = createStudentRepositories(db);
  student.credentials.create({
    id: extra.credentialId as typeof ids.session1,
    tokenHash: hashStudentSessionToken(token),
    createdAt: TIME,
    expiresAt: options.expiresAt ?? '2026-11-11T01:00:00.000Z',
    revokedAt: options.revokedAt ?? null,
    lastSeenAt: TIME,
  });
  if (options.mappedSession !== 'none') {
    student.browserParticipants.create({
      credentialId: extra.credentialId as typeof ids.session1,
      sessionId: (options.mappedSession ?? ids.session1) as typeof ids.session1,
      participantId: ids.participant1,
      createdAt: TIME,
    });
  }
  const identity = new StudentIdentityService(student, { now: () => '2026-11-10T02:00:00.000Z' });
  const app = express();
  app.get('/sessions/:sessionId/me', createStudentIdentityMiddleware(identity), requireActorContext, (req, res) => res.json(req.actorContext));
  return { app, identity };
}

describe('Student identity middleware', () => {
  it('derives Participant, Team and Session context from an opaque cookie mapping', async () => {
    const { app } = fixture();
    const response = await request(app).get(`/sessions/${ids.session1}/me`).set('Cookie', `student_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ actorKind: 'participant', actorId: ids.participant1, sessionId: ids.session1, teamId: ids.team1 });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(response.body.permissions).not.toContain('team:leader:transfer');
    expect(response.body.permissions).not.toContain('round:end');
  });

  it.each([
    ['missing cookie', undefined],
    ['malformed cookie', 'student_session=%ZZ'],
    ['unknown token', 'student_session=another-opaque-token'],
  ])('fails closed for a %s', async (_label, cookie) => {
    const { app } = fixture();
    let call = request(app).get(`/sessions/${ids.session1}/me`);
    if (cookie) call = call.set('Cookie', cookie);
    const response = await call;
    expect(response.status).toBe(401);
  });

  it('rejects expired, revoked and cross-Session credentials', async () => {
    const expired = fixture({ expiresAt: '2026-11-10T01:59:59.000Z' });
    const revoked = fixture({ revokedAt: '2026-11-10T01:00:00.000Z' });
    const crossSession = fixture({ mappedSession: 'none' });
    const cookie = `student_session=${token}`;

    expect((await request(expired.app).get(`/sessions/${ids.session1}/me`).set('Cookie', cookie)).status).toBe(401);
    expect((await request(revoked.app).get(`/sessions/${ids.session1}/me`).set('Cookie', cookie)).status).toBe(401);
    expect((await request(crossSession.app).get(`/sessions/${ids.session2}/me`).set('Cookie', cookie)).status).toBe(401);
  });

  it('ignores client-supplied actor and team headers', async () => {
    const { app } = fixture();
    const response = await request(app).get(`/sessions/${ids.session1}/me`)
      .set('Cookie', `student_session=${token}`)
      .set('X-Actor-Kind', 'teacher')
      .set('X-Team-Id', ids.teamOtherSession);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ actorKind: 'participant', actorId: ids.participant1, teamId: ids.team1 });
  });
});
