import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../apps/server/src/persistence/repositories/index.js';
import {
  createActivity,
  createTeacherTestServer,
  loginAsTeacher,
  seedQuestionGroupTargets,
  teacherApi,
} from '../helpers/teacher.js';

async function setup(seed = true) {
  const server = createTeacherTestServer();
  const auth = await loginAsTeacher(server);
  const api = teacherApi(server, auth);
  const { sessionId } = await createActivity(server, auth);
  const targets = seed ? seedQuestionGroupTargets(server, sessionId) : undefined;
  const base = `/sessions/${sessionId}`;
  const version = async () => (await api.get(base)).body.data.state.stateVersion as number;
  const statuses = async () => (await api.get(base)).body.data.targets.map((t: { number: string; status: string }) => `${t.number}:${t.status}`);
  return { server, api, sessionId, targets, base, version, statuses };
}

describe('Teacher round control', () => {
  it('lists targets in position order with NotOpened status, group sizes and blank counts', async () => {
    const { api, base } = await setup();
    const targets = (await api.get(base)).body.data.targets;
    expect(targets.map((t: { number: string; kind: string; questionCount: number; blankCount: number; status: string }) =>
      [t.number, t.kind, t.questionCount, t.blankCount, t.status]))
      .toEqual([
        ['1', 'questionGroup', 2, 2, 'NotOpened'],
        ['2', 'questionGroup', 2, 2, 'NotOpened'],
        ['3', 'question', 1, 1, 'NotOpened'],
        ['4', 'question', 1, 1, 'NotOpened'],
      ]);
  });

  it('runs next → start → end and moves target status Waiting → Active → Ended', async () => {
    const { api, base, version, statuses } = await setup();
    const next = await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
    expect(next.status).toBe(200);
    expect(next.body.data).toMatchObject({ phase: 'Waiting', target: { kind: 'questionGroup' } });
    expect(await statuses()).toEqual(['1:Waiting', '2:NotOpened', '3:NotOpened', '4:NotOpened']);
    const start = await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() });
    expect(start.body.data.phase).toBe('Active');
    expect(await statuses()).toEqual(['1:Active', '2:NotOpened', '3:NotOpened', '4:NotOpened']);
    const end = await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() });
    expect(end.status).toBe(200);
    expect(end.body.data.phase).toBe('Ended');
    expect(await statuses()).toEqual(['1:Ended', '2:NotOpened', '3:NotOpened', '4:NotOpened']);
    await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
    expect(await statuses()).toEqual(['1:Ended', '2:Waiting', '3:NotOpened', '4:NotOpened']);
  });

  it('selects a specific target and reopens an Ended target as a new Waiting Round', async () => {
    const { api, base, version, targets, statuses } = await setup();
    const target = { kind: 'question', questionId: targets!.question3 };
    const first = await api.post(`${base}/rounds/select`, { target, expectedStateVersion: await version() });
    expect(first.status).toBe(200);
    await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() });
    await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() });
    const reopened = await api.post(`${base}/rounds/select`, { target, expectedStateVersion: await version() });
    expect(reopened.body.data.phase).toBe('Waiting');
    expect(reopened.body.data.currentRoundId).not.toBe(first.body.data.currentRoundId);
    const three = (await api.get(base)).body.data.targets.find((t: { number: string }) => t.number === '3');
    expect(three).toMatchObject({ status: 'Waiting', roundCount: 2 });
    expect(await statuses()).toContain('3:Waiting');
  });

  it('rejects selecting while the current Round is Waiting or Active (INVALID_PHASE)', async () => {
    const { api, base, version, targets } = await setup();
    await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
    const whileWaiting = await api.post(`${base}/rounds/select`, { target: { kind: 'question', questionId: targets!.question3 }, expectedStateVersion: await version() });
    expect(whileWaiting.status).toBe(409);
    expect(whileWaiting.body.error.code).toBe('INVALID_PHASE');
    await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() });
    const whileActive = await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
    expect(whileActive.body.error.code).toBe('INVALID_PHASE');
  });

  it('rejects start and end in the wrong phase', async () => {
    const { api, base, version } = await setup();
    expect((await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() })).body.error.code).toBe('INVALID_PHASE');
    expect((await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() })).body.error.code).toBe('INVALID_PHASE');
    await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
    expect((await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() })).body.error.code).toBe('INVALID_PHASE');
    await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() });
    expect((await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() })).body.error.code).toBe('INVALID_PHASE');
  });

  it('rejects an old state version with STALE_STATE', async () => {
    const { api, base, version } = await setup();
    const old = await version();
    await api.post(`${base}/rounds/next`, { expectedStateVersion: old });
    const stale = await api.post(`${base}/rounds/start`, { expectedStateVersion: old });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_STATE');
  });

  it('rejects targets without answerable blanks and empty groups (TARGET_NOT_ANSWERABLE)', async () => {
    const { server, api, base, version, sessionId } = await setup();
    const repositories = createFoundationRepositories(server.database);
    const noBlank = randomUUID() as UUID;
    repositories.questions.create({ id: noBlank, sessionId, questionGroupId: null, displayNumber: '9', prompt: null, position: 9 });
    const emptyGroup = randomUUID() as UUID;
    repositories.questionGroups.create({ id: emptyGroup, sessionId, label: '10', position: 10 });
    for (const target of [{ kind: 'question', questionId: noBlank }, { kind: 'questionGroup', questionGroupId: emptyGroup }]) {
      const response = await api.post(`${base}/rounds/select`, { target, expectedStateVersion: await version() });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('TARGET_NOT_ANSWERABLE');
    }
  });

  it('rejects unknown targets and targets from another activity', async () => {
    const { server, api, base, version } = await setup();
    const other = await setup();
    const unknown = await api.post(`${base}/rounds/select`, { target: { kind: 'question', questionId: randomUUID() }, expectedStateVersion: await version() });
    expect(unknown.body.error.code).toBe('TARGET_NOT_FOUND');
    const foreign = await api.post(`${base}/rounds/select`, { target: { kind: 'question', questionId: other.targets!.question3 }, expectedStateVersion: await version() });
    expect(foreign.status).toBe(404);
    expect(server).toBeDefined();
  });

  it('answers NO_QUESTIONS before import and NO_NEXT_TARGET when every target was opened', async () => {
    const empty = await setup(false);
    expect((await empty.api.post(`${empty.base}/rounds/next`, { expectedStateVersion: await empty.version() })).body.error.code).toBe('NO_QUESTIONS');
    const { api, base, version } = await setup();
    for (let i = 0; i < 4; i += 1) {
      await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
      await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() });
      await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() });
    }
    const none = await api.post(`${base}/rounds/next`, { expectedStateVersion: await version() });
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NO_NEXT_TARGET');
  });

  it('validates request bodies', async () => {
    const { api, base } = await setup();
    expect((await api.post(`${base}/rounds/next`, {})).status).toBe(400);
    expect((await api.post(`${base}/rounds/select`, { target: { kind: 'question', questionId: 'x' }, expectedStateVersion: 0 })).status).toBe(400);
  });
});
