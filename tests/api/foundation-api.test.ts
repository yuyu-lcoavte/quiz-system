import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ActorContext } from '@quiz/contracts/identity';
import { createApp } from '../../apps/server/src/app.js';
import { createFoundationRepositories } from '../../apps/server/src/persistence/repositories/index.js';
import { resolveMigrationsDirectory } from '../../apps/server/src/persistence/migrate.js';
import { createTestDatabase } from '../helpers/sqlite.js';
import { ids, question, round, session, team } from '../helpers/foundation.js';
import { createWaitingRound } from '../../apps/server/src/modules/sessions/application/foundation-transactions.js';
import { SessionLifecycleService } from '../../apps/server/src/modules/sessions/application/session-lifecycle-service.js';

const teacher: ActorContext = { actorKind: 'teacher', actorId: 'teacher-1', sessionId: ids.session1, permissions: ['session:read', 'target:preview', 'target:read', 'results:read', 'session:watch'] };
const participant: ActorContext = { actorKind: 'participant', actorId: ids.participant1, sessionId: ids.session1, teamId: ids.team1, permissions: ['session:read', 'target:read', 'results:read', 'session:watch'] };

describe('Foundation session HTTP contracts', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let repos: ReturnType<typeof createFoundationRepositories>;

  beforeEach(() => {
    db = createTestDatabase();
    db.runMigrations(resolveMigrationsDirectory());
    repos = createFoundationRepositories(db.database);
    repos.sessions.create(session());
  });

  function app(actor: ActorContext | null = null, limit = 100) {
    return createApp({ database: db.database, resolveActorContext: () => actor, activityCodeRateLimit: { maxRequests: limit, windowMs: 60_000 } });
  }

  it('allows restricted anonymous lookup and returns only the public summary', async () => {
    const response = await request(app()).get('/api/v1/sessions/by-code/act-0001');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ sessionId: ids.session1, phase: 'Waiting' });
    expect(JSON.stringify(response.body)).not.toContain('Question');
  });

  it('validates anonymous lookup and throttles it with the common error envelope', async () => {
    const invalid = await request(app()).get('/api/v1/sessions/by-code/%20');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_INPUT');
    const limited = app(null, 1);
    expect((await request(limited).get('/api/v1/sessions/by-code/ACT-0001')).status).toBe(200);
    const response = await request(limited).get('/api/v1/sessions/by-code/ACT-0001');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('requires a trusted scoped actor and ignores client identity claims', async () => {
    const missing = await request(app()).get(`/api/v1/sessions/${ids.session1}/state`).set('x-actor-kind', 'teacher').set('x-team-id', ids.team1);
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHENTICATED');
    const wrongScope = await request(app({ ...teacher, sessionId: ids.session2 })).get(`/api/v1/sessions/${ids.session1}/state`);
    expect(wrongScope.status).toBe(403);
  });

  it('returns a consistent no-Round Waiting snapshot, null target, and empty results', async () => {
    const api = request(app(teacher));
    const summary = await api.get(`/api/v1/sessions/${ids.session1}`);
    expect(summary.body.data).toMatchObject({ sessionId: ids.session1, phase: 'Waiting', currentRoundId: null, stateVersion: 0 });
    const state = await api.get(`/api/v1/sessions/${ids.session1}/state`);
    expect(state.body.data).toMatchObject({ phase: 'Waiting', currentRoundId: null, target: null, stateVersion: 0 });
    const target = await api.get(`/api/v1/sessions/${ids.session1}/current-target`);
    expect(target.body).toEqual({ data: null });
    const results = await api.get(`/api/v1/sessions/${ids.session1}/results`);
    expect(results.body).toEqual({ data: [] });
  });

  it('denies Participant target content in Waiting and allows it in Active', async () => {
    repos.questions.create(question());
    repos.teams.create(team());
    createWaitingRound(db.database, { id: ids.round1, sessionId: ids.session1, target: { kind: 'question', questionId: ids.question1 }, createdAt: '2026-11-09T02:00:00.000Z', expectedStateVersion: 0 });
    const denied = await request(app(participant)).get(`/api/v1/sessions/${ids.session1}/current-target`);
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain('Question 20');

    db.database.prepare("UPDATE rounds SET phase = 'Active', started_at = ? WHERE id = ?").run('2026-11-09T02:01:00.000Z', ids.round1);
    const allowed = await request(app(participant)).get(`/api/v1/sessions/${ids.session1}/current-target`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.target.question.prompt).toBe('Question 20');
  });

  it('allows Teacher preview in Waiting but rejects an actor without preview permission', async () => {
    repos.questions.create(question());
    createWaitingRound(db.database, { id: ids.round1, sessionId: ids.session1, target: { kind: 'question', questionId: ids.question1 }, createdAt: '2026-11-09T02:00:00.000Z', expectedStateVersion: 0 });
    const preview = await request(app(teacher)).get(`/api/v1/sessions/${ids.session1}/current-target`);
    expect(preview.status).toBe(200);
    const denied = await request(app({ ...teacher, permissions: [] })).get(`/api/v1/sessions/${ids.session1}/current-target`);
    expect(denied.status).toBe(403);
  });

  it('keeps Participant results unavailable until Ended and returns the committed Result afterward', async () => {
    repos.questions.create(question());
    repos.teams.create(team());
    createWaitingRound(db.database, { id: ids.round1, sessionId: ids.session1, target: { kind: 'question', questionId: ids.question1 }, createdAt: '2026-11-09T02:00:00.000Z', expectedStateVersion: 0 });
    const lifecycle = new SessionLifecycleService(db.database, { now: () => '2026-11-09T02:01:00.000Z', createId: () => ids.round2 });
    lifecycle.startRound(ids.session1, 1);
    repos.submissions.create({ id: ids.submission1, teamId: ids.team1, roundId: ids.round1, receivedAt: '2026-11-09T02:01:30.000Z', acceptedOrder: 1 });
    const active = await request(app(participant)).get(`/api/v1/sessions/${ids.session1}/results`);
    expect(active.status).toBe(403);
    lifecycle.endRound(ids.session1, 2, { id: ids.result1, roundId: ids.round1, winningSubmissionId: ids.submission1, createdAt: '2026-11-09T02:02:00.000Z' });
    const ended = await request(app(participant)).get(`/api/v1/sessions/${ids.session1}/results`);
    expect(ended.status).toBe(200);
    expect(ended.body.data).toEqual([expect.objectContaining({ id: ids.result1, roundId: ids.round1 })]);
    const hidden = await request(app(participant)).get(`/api/v1/sessions/${ids.session1}/current-target`);
    expect(hidden.status).toBe(403);
    expect(JSON.stringify(hidden.body)).not.toContain('Question 20');
  });

  it('rejects a verified Participant whose Team belongs to another Session', async () => {
    repos.sessions.create(session(ids.session2));
    repos.teams.create(team(ids.teamOtherSession, ids.session2));
    const mismatched = { ...participant, teamId: ids.teamOtherSession };
    const response = await request(app(mismatched)).get(`/api/v1/sessions/${ids.session1}/results`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns invalid-id and unknown-session failures using the shared envelope', async () => {
    const invalid = await request(app(teacher)).get('/api/v1/sessions/not-a-uuid/state');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_INPUT');
    const unknown = await request(app(teacher)).get('/api/v1/sessions/00000000-0000-4000-8000-000000000099/state');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});
