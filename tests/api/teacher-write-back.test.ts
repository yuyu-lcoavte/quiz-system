import { describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import { seedDemoActivity } from '../../apps/server/src/modules/teacher/dev/seed-demo.js';
import { FakeSheetsGateway } from '../helpers/fake-sheets-gateway.js';
import { GROUP_TEMPLATE } from '../fixtures/guided-notes/index.js';
import { createActivity, createTeacherTestServer, joinStudent, loginAsTeacher, submitAnswers, teacherApi } from '../helpers/teacher.js';

const SHEET_ID = '1TestSpreadsheetId_abcdefghijklmnop';
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;

type Entry = { cellA1: string; currentContent: string; newContent: string; kind: 'write' | 'restore'; number: string };

async function setup() {
  const gateway = new FakeSheetsGateway().addSheet(SHEET_ID, 0, GROUP_TEMPLATE);
  const server = createTeacherTestServer({ withStudents: true, sheetsGateway: gateway });
  const auth = await loginAsTeacher(server);
  const api = teacherApi(server, auth);
  const { sessionId } = await createActivity(server, auth, 2);
  const base = `/sessions/${sessionId}`;
  const { previewDigest } = (await api.post(`${base}/import/preview`, { url: URL })).body.data;
  await api.post(`${base}/import/confirm`, { url: URL, previewDigest });
  const detail = async () => (await api.get(base)).body.data;
  const version = async () => (await detail()).state.stateVersion as number;
  const { teams, targets } = await detail();
  const students = [await joinStudent(server, sessionId, teams[0].teamId, 'A'), await joinStudent(server, sessionId, teams[1].teamId, 'B')];
  const blankAt = (cellA1: string) => (server.database.prepare('SELECT blank_id FROM teacher_blank_cells WHERE cell_a1 = ?').get(cellA1) as { blank_id: UUID }).blank_id;
  const play = async (number: string, team: 0 | 1 | null, answers: Record<string, string> = {}) => {
    const target = targets.find((t: { number: string }) => t.number === number).target;
    await api.post(`${base}/rounds/select`, { target, expectedStateVersion: await version() });
    const roundId = (await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() })).body.data.currentRoundId as UUID;
    if (team !== null) {
      const byBlank = Object.fromEntries(Object.entries(answers).map(([cell, value]) => [blankAt(cell), value]));
      expect((await submitAnswers(server, sessionId, roundId, students[team], byBlank)).status).toBe(200);
    }
    await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() });
  };
  const preview = () => api.post(`${base}/write-back/preview`);
  const confirm = (planDigest: string) => api.post(`${base}/write-back/confirm`, { planDigest });
  const cell = (a1: string) => gateway.cell(SHEET_ID, 0, a1);
  return { server, api, base, sessionId, gateway, play, preview, confirm, cell };
}

describe('Answer write-back', () => {
  it('previews every target with a winner, keeping markers, and leaves other targets out', async () => {
    const f = await setup();
    await f.play('1', 1, { H5: 'CPU', H6: 'OS' });
    await f.play('3', 0, { G11: '42' });
    const response = await f.preview();
    expect(response.status).toBe(200);
    const entries = response.body.data.entries as Entry[];
    expect(entries.map((e) => [e.number, e.cellA1, e.currentContent, e.newContent, e.kind])).toEqual([
      ['1', 'H5', '', 'CPU', 'write'],
      ['1', 'H6', '', 'OS', 'write'],
      ['3', 'G11', '', '42', 'write'],
    ]);
    expect(response.body.data.planDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(f.gateway.writes).toHaveLength(0);
  });

  it('writes all cells in one batch on confirm and remembers what was written', async () => {
    const f = await setup();
    await f.play('1', 1, { H5: 'CPU', H6: 'OS' });
    const { planDigest } = (await f.preview()).body.data;
    const confirmed = await f.confirm(planDigest);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toEqual({ written: 2 });
    expect(f.gateway.writes).toHaveLength(1);
    expect([f.cell('H5'), f.cell('H6')]).toEqual(['CPU', 'OS']);
    expect([f.cell('G5'), f.cell('G6')]).toEqual(['（1）', '（2）']); // marker labels untouched
    const rows = f.server.database.prepare('SELECT cell_a1, last_written_content FROM teacher_blank_cells WHERE cell_a1 IN (?, ?) ORDER BY cell_a1').all('H5', 'H6');
    expect(rows).toEqual([{ cell_a1: 'H5', last_written_content: 'CPU' }, { cell_a1: 'H6', last_written_content: 'OS' }]);
    expect((await f.preview()).body.error.code).toBe('NOTHING_TO_WRITE');
  });

  it('replaces a previously written answer after a reopen with a new winner (no appending)', async () => {
    const f = await setup();
    await f.play('1', 1, { H5: 'CPU', H6: 'OS' });
    await f.confirm((await f.preview()).body.data.planDigest);
    await f.play('1', 0, { H5: 'GPU', H6: 'RAM' });
    const entries = (await f.preview()).body.data.entries as Entry[];
    expect(entries.map((e) => [e.cellA1, e.currentContent, e.newContent, e.kind])).toEqual([
      ['H5', 'CPU', 'GPU', 'write'],
      ['H6', 'OS', 'RAM', 'write'],
    ]);
    await f.confirm((await f.preview()).body.data.planDigest);
    expect([f.cell('H5'), f.cell('H6')]).toEqual(['GPU', 'RAM']);
    expect([f.cell('G5'), f.cell('G6')]).toEqual(['（1）', '（2）']);
  });

  it('restores the original content when a written target is reopened and nobody submits', async () => {
    const f = await setup();
    await f.play('1', 1, { H5: 'CPU', H6: 'OS' });
    await f.confirm((await f.preview()).body.data.planDigest);
    await f.play('1', null);
    const entries = (await f.preview()).body.data.entries as Entry[];
    expect(entries.map((e) => [e.cellA1, e.currentContent, e.newContent, e.kind])).toEqual([
      ['H5', 'CPU', '', 'restore'],
      ['H6', 'OS', '', 'restore'],
    ]);
    await f.confirm((await f.preview()).body.data.planDigest);
    expect([f.cell('H5'), f.cell('H6')]).toEqual(['', '']);
    expect([f.cell('G5'), f.cell('G6')]).toEqual(['（1）', '（2）']);
  });

  it('writes nothing when a cell was changed by someone else (SHEET_CONFLICT)', async () => {
    const f = await setup();
    await f.play('1', 1, { H5: 'CPU', H6: 'OS' });
    const { planDigest } = (await f.preview()).body.data;
    f.gateway.setCell(SHEET_ID, 0, 'H6', 'someone typed');
    const response = await f.confirm(planDigest);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SHEET_CONFLICT');
    expect(response.body.error.details.cells).toEqual([{ cellA1: 'H6', expected: '', actual: 'someone typed' }]);
    expect(f.gateway.writes).toHaveLength(0);
    expect(f.cell('H5')).toBe('');
  });

  it('reports a cell that no longer exists as a conflict', async () => {
    const f = await setup();
    await f.play('3', 0, { G11: '42' });
    const { planDigest } = (await f.preview()).body.data;
    // Simulate rows deleted below row 10: the fake returns null for cells outside the grid.
    f.gateway.beforeReadCells = () => { (f.gateway as unknown as { sheets: Map<string, { grid: { values: string[][] } }[]> }).sheets.get(SHEET_ID)![0].grid.values.length = 10; };
    const response = await f.confirm(planDigest);
    expect(response.status).toBe(409);
    expect(response.body.error.details.cells).toEqual([{ cellA1: 'G11', expected: '', actual: null }]);
    expect(f.gateway.writes).toHaveLength(0);
  });

  it('rejects a confirm whose plan no longer matches the results (STALE_STATE)', async () => {
    const f = await setup();
    await f.play('1', 1, { H5: 'CPU', H6: 'OS' });
    const { planDigest } = (await f.preview()).body.data;
    await f.play('3', 0, { G11: '42' });
    const response = await f.confirm(planDigest);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STALE_STATE');
    expect(f.gateway.writes).toHaveLength(0);
  });

  it('answers NOTHING_TO_WRITE before any winner and NOT_IMPORTED for the seeded demo activity', async () => {
    const f = await setup();
    expect((await f.preview()).body.error.code).toBe('NOTHING_TO_WRITE');
    const { sessionId } = seedDemoActivity(f.server.database, { nodeEnv: 'test' });
    const response = await f.api.post(`/sessions/${sessionId}/write-back/preview`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NOT_IMPORTED');
  });

  it('validates the confirm body', async () => {
    const f = await setup();
    expect((await f.api.post(`${f.base}/write-back/confirm`, { planDigest: 'x' })).status).toBe(400);
  });
});
