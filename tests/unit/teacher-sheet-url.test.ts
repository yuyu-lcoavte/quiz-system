import { describe, expect, it } from 'vitest';
import { parseSheetUrl } from '../../apps/server/src/modules/teacher/guided-notes/sheet-url.js';

const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';

describe('Google Sheets URL parsing', () => {
  it('reads the spreadsheet id and the tab gid from the fragment or the query', () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=123`)).toEqual({ spreadsheetId: id, sheetId: 123 });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=45#gid=45`)).toEqual({ spreadsheetId: id, sheetId: 45 });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing&gid=0`)).toEqual({ spreadsheetId: id, sheetId: 0 });
  });

  it('uses the first tab (null) when no gid is given', () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${id}`)).toEqual({ spreadsheetId: id, sheetId: null });
    expect(parseSheetUrl(`  https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing  `)).toEqual({ spreadsheetId: id, sheetId: null });
  });

  it.each([
    ['another host', `https://evil.example/spreadsheets/d/${id}/edit`],
    ['a lookalike host', `https://docs.google.com.evil.example/spreadsheets/d/${id}`],
    ['plain http', `http://docs.google.com/spreadsheets/d/${id}`],
    ['a short id', 'https://docs.google.com/spreadsheets/d/short/edit'],
    ['a Docs document', `https://docs.google.com/document/d/${id}/edit`],
    ['a non-numeric gid', `https://docs.google.com/spreadsheets/d/${id}/edit#gid=abc`],
    ['not a URL', 'just some text'],
    ['an empty string', ''],
  ])('rejects %s with INVALID_SHEET_URL', (_label, url) => {
    expect(() => parseSheetUrl(url)).toThrow(expect.objectContaining({ status: 400, code: 'INVALID_SHEET_URL' }));
  });
});
