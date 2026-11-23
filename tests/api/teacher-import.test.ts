import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createActivity, createTeacherTestServer, loginAsTeacher, teacherApi, TEACHER_TEST_ORIGIN } from '../helpers/teacher.js';
import { FakeSheetsGateway } from '../helpers/fake-sheets-gateway.js';
import { GROUP_TEMPLATE, MISSING_ANSWER_HEADER, DUPLICATE_NUMBER, SINGLE_TEMPLATE } from '../fixtures/guided-notes/index.js';

const SHEET_ID = '1TestSpreadsheetId_abcdefghijklmnop';
const url = (gid?: number) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit${gid === undefined ? '' : `#gid=${gid}`}`;

async function setup(gateway: FakeSheetsGateway | null = new FakeSheetsGateway().addSheet(SHEET_ID, 0, GROUP_TEMPLATE).addSheet(SHEET_ID, 7, SINGLE_TEMPLATE)) {
  const server = createTeacherTestServer({ sheetsGateway: gateway ?? undefined });
  const auth = await loginAsTeacher(server);
  const api = teacherApi(server, auth);
  const { sessionId } = await createActivity(server, auth);
  const base = `/sessions/${sessionId}`;
  const count = (table: string) => (server.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { server, api, base, sessionId, gateway, count };
}

describe('Guided Notes import', () => {
  it('previews numbers, groups and blank cells without saving anything', async () => {
    const f = await setup();
    const response = await f.api.post(`${f.base}/import/preview`, { url: url(0) });
    expect(response.status).toBe(200);
    const preview = response.body.data;
    expect(preview).toMatchObject({ spreadsheetId: SHEET_ID, sheetId: 0, sheetTitle: '學習單', questionNumberCount: 4, warnings: [] });
    expect(preview.previewDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.targets.map((t: { number: string; kind: string }) => `${t.number}:${t.kind}`))
      .toEqual(['1:questionGroup', '2:questionGroup', '3:question', '4:question']);
    expect(preview.targets[0].questions).toEqual([
      { row: 5, blanks: [{ cellA1: 'H5', labelCellA1: 'G5', marker: '（1）', originalContent: '' }] },
      { row: 6, blanks: [{ cellA1: 'H6', labelCellA1: 'G6', marker: '（2）', originalContent: '' }] },
    ]);
    expect(f.count('questions')).toBe(0);
    expect(f.count('teacher_sheet_sources')).toBe(0);
  });

  it('uses the tab from the URL, or the first tab when none is given', async () => {
    const f = await setup();
    expect((await f.api.post(`${f.base}/import/preview`, { url: url(7) })).body.data.questionNumberCount).toBe(6);
    expect((await f.api.post(`${f.base}/import/preview`, { url: url() })).body.data).toMatchObject({ sheetId: 0, questionNumberCount: 4 });
  });

  it('confirms into Questions, Blanks, Groups and blank-cell rows that match the preview', async () => {
    const f = await setup();
    const { previewDigest } = (await f.api.post(`${f.base}/import/preview`, { url: url(0) })).body.data;
    const confirmed = await f.api.post(`${f.base}/import/confirm`, { url: url(0), previewDigest });
    expect(confirmed.status).toBe(201);
    const view = confirmed.body.data;
    expect(view.targets.map((t: { number: string; kind: string; questionCount: number; blankCount: number; status: string }) =>
      [t.number, t.kind, t.questionCount, t.blankCount, t.status])).toEqual([
      ['1', 'questionGroup', 2, 2, 'NotOpened'],
      ['2', 'questionGroup', 2, 2, 'NotOpened'],
      ['3', 'question', 1, 1, 'NotOpened'],
      ['4', 'question', 1, 1, 'NotOpened'],
    ]);
    expect(view.source).toMatchObject({ sheetTitle: '學習單', spreadsheetUrl: expect.stringContaining(SHEET_ID) });
    const cells = f.server.database.prepare(`SELECT c.cell_a1, c.marker, b.label FROM teacher_blank_cells c JOIN blanks b ON b.id = c.blank_id
      ORDER BY c.cell_a1`).all() as { cell_a1: string; marker: string | null; label: string | null }[];
    expect(cells.map((c) => `${c.cell_a1}|${c.marker ?? '-'}|${c.label ?? '-'}`)).toEqual(['G11|-|-', 'G13|-|-', 'H5|（1）|（1）', 'H6|（2）|（2）', 'H8|（1）|（1）', 'H9|（2）|（2）']);
    const list = (await f.api.get('/sessions')).body.data.find((a: { sessionId: string }) => a.sessionId === f.sessionId);
    expect(list.imported).toBe(true);
  });

  it('replaces previously imported questions when re-imported before the first Round', async () => {
    const f = await setup();
    for (const gid of [0, 7]) {
      const { previewDigest } = (await f.api.post(`${f.base}/import/preview`, { url: url(gid) })).body.data;
      expect((await f.api.post(`${f.base}/import/confirm`, { url: url(gid), previewDigest })).status).toBe(201);
    }
    expect(f.count('questions')).toBe(6);
    expect(f.count('question_groups')).toBe(0);
    expect(f.count('teacher_blank_cells')).toBe(6);
  });

  it('locks import after the first Round (IMPORT_LOCKED)', async () => {
    const f = await setup();
    const { previewDigest } = (await f.api.post(`${f.base}/import/preview`, { url: url(0) })).body.data;
    await f.api.post(`${f.base}/import/confirm`, { url: url(0), previewDigest });
    await f.api.post(`${f.base}/rounds/next`, { expectedStateVersion: 0 });
    const again = await f.api.post(`${f.base}/import/confirm`, { url: url(0), previewDigest });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('IMPORT_LOCKED');
  });

  it('rejects confirm when the sheet changed after preview (PREVIEW_CHANGED) and saves nothing', async () => {
    const f = await setup();
    const { previewDigest } = (await f.api.post(`${f.base}/import/preview`, { url: url(0) })).body.data;
    f.gateway!.setCell(SHEET_ID, 0, 'B15', '5');
    const confirmed = await f.api.post(`${f.base}/import/confirm`, { url: url(0), previewDigest });
    expect(confirmed.status).toBe(409);
    expect(confirmed.body.error.code).toBe('PREVIEW_CHANGED');
    expect(f.count('questions')).toBe(0);
  });

  it.each([
    ['SHEET_NOT_SHARED', 403],
    ['SHEET_NOT_FOUND', 404],
    ['SHEETS_UNAVAILABLE', 502],
  ] as const)('maps gateway failure %s to HTTP %i', async (code, status) => {
    const f = await setup();
    f.gateway!.failWith(code);
    const response = await f.api.post(`${f.base}/import/preview`, { url: url(0) });
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
  });

  it('reports structure errors from the parser with the problem cell', async () => {
    const gateway = new FakeSheetsGateway().addSheet(SHEET_ID, 1, MISSING_ANSWER_HEADER).addSheet(SHEET_ID, 2, DUPLICATE_NUMBER);
    const f = await setup(gateway);
    const missing = await f.api.post(`${f.base}/import/preview`, { url: url(1) });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('SHEET_FORMAT_INVALID');
    const duplicate = await f.api.post(`${f.base}/import/preview`, { url: url(2) });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error).toMatchObject({ code: 'DUPLICATE_QUESTION_NUMBER', details: { cellA1: 'A4' } });
  });

  it('rejects bad URLs and unknown tabs', async () => {
    const f = await setup();
    expect((await f.api.post(`${f.base}/import/preview`, { url: 'https://example.com/x' })).body.error.code).toBe('INVALID_SHEET_URL');
    expect((await f.api.post(`${f.base}/import/preview`, { url: url(99) })).body.error.code).toBe('SHEET_NOT_FOUND');
    expect((await f.api.post(`${f.base}/import/preview`, {})).status).toBe(400);
  });

  it('answers 503 SHEETS_NOT_CONFIGURED without a gateway and shows the service-account email on /me when configured', async () => {
    const none = await setup(null);
    const response = await none.api.post(`${none.base}/import/preview`, { url: url(0) });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SHEETS_NOT_CONFIGURED');
    expect((await none.api.get('/me')).body.data.serviceAccountEmail).toBeNull();
    const configured = await setup();
    expect((await configured.api.get('/me')).body.data.serviceAccountEmail).toBe('quiz-system@test-project.iam.gserviceaccount.com');
  });

  it('requires Teacher login', async () => {
    const f = await setup();
    expect((await request(f.server.app).post(`/api/v1/teacher${f.base}/import/preview`).set('Origin', TEACHER_TEST_ORIGIN).send({ url: url(0) })).status).toBe(401);
  });
});
