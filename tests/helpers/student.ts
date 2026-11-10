import request from 'supertest';
import { createApp } from '../../apps/server/src/app.js';
import { createFoundationTestContext, ids, session, team } from './foundation.js';
export function studentFixture(limit = 100) {
  const c = createFoundationTestContext();
  c.repositories.sessions.create(session()); c.repositories.sessions.create(session(ids.session2));
  c.repositories.teams.create(team()); c.repositories.teams.create(team(ids.team2));
  c.repositories.teams.create(team(ids.teamOtherSession, ids.session2));
  const app = createApp({ database: c.database, studentSecurity: { secret: 'test-secret-'.repeat(4), allowedOrigins: ['http://127.0.0.1:5173'] }, activityCodeRateLimit: { maxRequests: limit, windowMs: 60000 } });
  const base = `/api/v1/student/sessions/${ids.session1}`;
  const join = (name = 'Student', teamId = ids.team1) => request(app).post(`${base}/enrollments`).set('Origin', 'http://127.0.0.1:5173').send({ teamId, displayName: name });
  return { ...c, app, base, join };
}
export function cookieOf(response: { headers: Record<string, any> }): string { return String(response.headers['set-cookie'][0]).split(';')[0]; }
