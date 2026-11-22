import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleSheetsGateway, mapGoogleError, type SheetsApiSubset } from '../../apps/server/src/modules/teacher/sheets/google-sheets-gateway.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function keyFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'teacher-key-'));
  dirs.push(dir);
  const path = join(dir, 'service-account.json');
  writeFileSync(path, content);
  return path;
}

const validKey = () => keyFile(JSON.stringify({ type: 'service_account', client_email: 'bot@proj.iam.gserviceaccount.com', private_key: 'PRIVATE-KEY-SECRET' }));

function fakeApi(overrides: Partial<{ get: unknown; valuesGet: unknown; batchGet: unknown; batchUpdate: unknown }> = {}) {
  const calls: { method: string; params: unknown; options?: unknown }[] = [];
  const respond = (method: string, value: unknown) => async (params: unknown, options?: unknown) => {
    calls.push({ method, params, options });
    if (value instanceof Error) throw value;
    return { data: value };
  };
  const api: SheetsApiSubset = {
    spreadsheets: {
      get: respond('get', overrides.get ?? {
        sheets: [
          { properties: { sheetId: 0, title: '封面', gridProperties: { rowCount: 10, columnCount: 5 } } },
          { properties: { sheetId: 42, title: "學習單 '1'", gridProperties: { rowCount: 20, columnCount: 8 } }, merges: [{ startRowIndex: 4, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 }] },
        ],
      }) as never,
      values: {
        get: respond('values.get', overrides.valuesGet ?? { values: [['', '題號'], ['', '1', '', '', '', '', '（1）']] }) as never,
        batchGet: respond('values.batchGet', overrides.batchGet ?? { valueRanges: [{ values: [['（1）CPU']] }, {}] }) as never,
      },
      batchUpdate: respond('batchUpdate', overrides.batchUpdate ?? {}) as never,
    },
  };
  return { api, calls };
}

function googleError(status: number) {
  return Object.assign(new Error(`Request failed: secret detail ${status}`), { response: { status, data: { error: { message: 'secret google body' } } } });
}

describe('GoogleSheetsGateway (googleapis adapter, no network)', () => {
  it('reads client_email from the key file and never exposes the private key', () => {
    const gateway = new GoogleSheetsGateway({ keyFile: validKey(), sheetsApi: fakeApi().api });
    expect(gateway.serviceAccountEmail()).toBe('bot@proj.iam.gserviceaccount.com');
    expect(JSON.stringify(gateway)).not.toContain('PRIVATE-KEY-SECRET');
  });

  it('fails at startup with a message that contains neither the path nor the key when the file is not a service-account key', () => {
    const path = keyFile('{"not":"a key"}');
    let message = '';
    try { new GoogleSheetsGateway({ keyFile: path }); } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/GOOGLE_SERVICE_ACCOUNT_KEY_FILE/);
    expect(message).not.toContain(path);
    expect(() => new GoogleSheetsGateway({ keyFile: join(tmpdir(), 'does-not-exist-key.json') })).toThrow(/GOOGLE_SERVICE_ACCOUNT_KEY_FILE/);
  });

  it('reads the requested tab with merges, using FORMATTED_VALUE and a quoted range', async () => {
    const { api, calls } = fakeApi();
    const gateway = new GoogleSheetsGateway({ keyFile: validKey(), sheetsApi: api });
    const tab = await gateway.readSheet({ spreadsheetId: 'sheet-id', sheetId: 42 });
    expect(tab).toEqual({
      sheetId: 42,
      sheetTitle: "學習單 '1'",
      values: [['', '題號'], ['', '1', '', '', '', '', '（1）']],
      merges: [{ startRow: 4, endRow: 6, startColumn: 1, endColumn: 2 }],
    });
    expect(calls[0]).toMatchObject({ method: 'get', params: { spreadsheetId: 'sheet-id', fields: expect.stringContaining('merges') } });
    expect(calls[1]).toMatchObject({ method: 'values.get', params: { spreadsheetId: 'sheet-id', range: "'學習單 ''1'''", valueRenderOption: 'FORMATTED_VALUE' } });
    expect(calls.every((call) => (call.options as { timeout?: number })?.timeout === 10_000)).toBe(true);
  });

  it('uses the first tab when no gid is given and reports an unknown gid as SHEET_NOT_FOUND', async () => {
    const gateway = new GoogleSheetsGateway({ keyFile: validKey(), sheetsApi: fakeApi().api });
    expect((await gateway.readSheet({ spreadsheetId: 'sheet-id', sheetId: null })).sheetTitle).toBe('封面');
    await expect(gateway.readSheet({ spreadsheetId: 'sheet-id', sheetId: 7 })).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
  });

  it('reads cells and returns null for cells outside the grid', async () => {
    const { api, calls } = fakeApi();
    const gateway = new GoogleSheetsGateway({ keyFile: validKey(), sheetsApi: api });
    const cells = await gateway.readCells({ spreadsheetId: 'sheet-id', sheetId: 42 }, ['G5', 'G6', 'Z99']);
    expect(cells).toEqual({ G5: '（1）CPU', G6: '', Z99: null });
    expect(calls.find((call) => call.method === 'values.batchGet')?.params).toMatchObject({ ranges: ["'學習單 ''1'''!G5", "'學習單 ''1'''!G6"] });
  });

  it('writes all cells in one batchUpdate with updateCells string values', async () => {
    const { api, calls } = fakeApi();
    const gateway = new GoogleSheetsGateway({ keyFile: validKey(), sheetsApi: api });
    await gateway.writeCells({ spreadsheetId: 'sheet-id', sheetId: 42 }, [{ cellA1: 'G5', text: '（1）CPU' }, { cellA1: 'AA10', text: 'x' }]);
    const update = calls.filter((call) => call.method === 'batchUpdate');
    expect(update).toHaveLength(1);
    expect(update[0].params).toEqual({
      spreadsheetId: 'sheet-id',
      requestBody: { requests: [
        { updateCells: { range: { sheetId: 42, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 7 }, rows: [{ values: [{ userEnteredValue: { stringValue: '（1）CPU' } }] }], fields: 'userEnteredValue' } },
        { updateCells: { range: { sheetId: 42, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 26, endColumnIndex: 27 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'x' } }] }], fields: 'userEnteredValue' } },
      ] },
    });
  });

  it('maps Google errors to safe codes without leaking the Google response', async () => {
    expect(mapGoogleError(googleError(403)).code).toBe('SHEET_NOT_SHARED');
    expect(mapGoogleError(googleError(404)).code).toBe('SHEET_NOT_FOUND');
    for (const status of [429, 500, 503]) expect(mapGoogleError(googleError(status)).code).toBe('SHEETS_UNAVAILABLE');
    expect(mapGoogleError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })).code).toBe('SHEETS_UNAVAILABLE');
    const gateway = new GoogleSheetsGateway({ keyFile: validKey(), sheetsApi: fakeApi({ get: googleError(403) }).api });
    const error = await gateway.readSheet({ spreadsheetId: 'sheet-id', sheetId: 0 }).catch((caught: Error) => caught);
    expect(error).toMatchObject({ status: 403, code: 'SHEET_NOT_SHARED' });
    expect(JSON.stringify(error) + (error as Error).message).not.toMatch(/secret/);
  });
});
