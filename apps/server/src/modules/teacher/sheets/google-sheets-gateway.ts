import { readFileSync } from 'node:fs';
import { HttpError } from '../../../errors/http-error.js';
import type { GridMerge } from '../guided-notes/parser.js';
import type { SheetRef } from '../guided-notes/sheet-url.js';
import { sheetsError, type SheetsGateway, type SheetTab } from './sheets-gateway.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const REQUEST_OPTIONS = { timeout: 10_000 };

type Call = (params: Record<string, unknown>, options?: { timeout: number }) => Promise<{ data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The part of googleapis' sheets_v4 client this adapter uses (lets tests inject a stand-in; no network). */
export interface SheetsApiSubset {
  spreadsheets: {
    get: Call;
    batchUpdate: Call;
    values: { get: Call; batchGet: Call };
  };
}

interface TabProperties { sheetId: number; title: string; rowCount: number; columnCount: number; merges: GridMerge[] }

/**
 * googleapis + service account (research.md R11, contracts/sheets-gateway.md).
 * The key file is read once for `client_email`; the key itself is only handed to googleapis and never logged.
 */
export class GoogleSheetsGateway implements SheetsGateway {
  private readonly email: string;
  private client: Promise<SheetsApiSubset> | null;

  constructor(private readonly options: { keyFile: string; sheetsApi?: SheetsApiSubset }) {
    this.email = readClientEmail(options.keyFile);
    this.client = options.sheetsApi ? Promise.resolve(options.sheetsApi) : null;
  }

  serviceAccountEmail(): string {
    return this.email;
  }

  async readSheet(ref: SheetRef): Promise<SheetTab> {
    return this.guard(async (api) => {
      const tabs = await this.tabs(api, ref.spreadsheetId);
      const tab = ref.sheetId === null ? tabs[0] : tabs.find((entry) => entry.sheetId === ref.sheetId);
      if (!tab) throw sheetsError('SHEET_NOT_FOUND');
      const response = await api.spreadsheets.values.get(
        { spreadsheetId: ref.spreadsheetId, range: quoteTitle(tab.title), valueRenderOption: 'FORMATTED_VALUE', majorDimension: 'ROWS' },
        REQUEST_OPTIONS,
      );
      const values = ((response.data?.values ?? []) as unknown[][]).map((row) => row.map((value) => (value == null ? '' : String(value))));
      return { sheetId: tab.sheetId, sheetTitle: tab.title, values, merges: tab.merges };
    });
  }

  async readCells(ref: { spreadsheetId: string; sheetId: number }, cellsA1: string[]): Promise<Record<string, string | null>> {
    return this.guard(async (api) => {
      const out: Record<string, string | null> = Object.fromEntries(cellsA1.map((cell) => [cell, null]));
      const tab = (await this.tabs(api, ref.spreadsheetId)).find((entry) => entry.sheetId === ref.sheetId);
      if (!tab) return out; // deleted tab → every cell missing
      const inside = cellsA1.filter((cell) => {
        const { row, column } = a1ToIndex(cell);
        return row < tab.rowCount && column < tab.columnCount;
      });
      if (inside.length === 0) return out;
      const response = await api.spreadsheets.values.batchGet(
        { spreadsheetId: ref.spreadsheetId, ranges: inside.map((cell) => `${quoteTitle(tab.title)}!${cell}`), valueRenderOption: 'FORMATTED_VALUE' },
        REQUEST_OPTIONS,
      );
      const ranges = (response.data?.valueRanges ?? []) as { values?: unknown[][] }[];
      inside.forEach((cell, index) => {
        const value = ranges[index]?.values?.[0]?.[0];
        out[cell] = value == null ? '' : String(value);
      });
      return out;
    });
  }

  async writeCells(ref: { spreadsheetId: string; sheetId: number }, updates: { cellA1: string; text: string }[]): Promise<void> {
    if (updates.length === 0) return;
    await this.guard(async (api) => {
      // One batchUpdate: Google applies all requests or none.
      await api.spreadsheets.batchUpdate({
        spreadsheetId: ref.spreadsheetId,
        requestBody: {
          requests: updates.map((update) => {
            const { row, column } = a1ToIndex(update.cellA1);
            return {
              updateCells: {
                range: { sheetId: ref.sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: column, endColumnIndex: column + 1 },
                rows: [{ values: [{ userEnteredValue: { stringValue: update.text } }] }],
                fields: 'userEnteredValue',
              },
            };
          }),
        },
      }, REQUEST_OPTIONS);
    });
  }

  private async tabs(api: SheetsApiSubset, spreadsheetId: string): Promise<TabProperties[]> {
    const response = await api.spreadsheets.get(
      { spreadsheetId, fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),merges)' },
      REQUEST_OPTIONS,
    );
    return ((response.data?.sheets ?? []) as { properties?: any; merges?: any[] }[]).map((sheet) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      sheetId: Number(sheet.properties?.sheetId ?? 0),
      title: String(sheet.properties?.title ?? ''),
      rowCount: Number(sheet.properties?.gridProperties?.rowCount ?? Number.MAX_SAFE_INTEGER),
      columnCount: Number(sheet.properties?.gridProperties?.columnCount ?? Number.MAX_SAFE_INTEGER),
      merges: (sheet.merges ?? []).map((merge) => ({
        startRow: Number(merge.startRowIndex ?? 0),
        endRow: Number(merge.endRowIndex ?? 0),
        startColumn: Number(merge.startColumnIndex ?? 0),
        endColumn: Number(merge.endColumnIndex ?? 0),
      })),
    }));
  }

  private async guard<T>(work: (api: SheetsApiSubset) => Promise<T>): Promise<T> {
    try {
      return await work(await this.api());
    } catch (error) {
      throw mapGoogleError(error);
    }
  }

  /** googleapis is loaded on first real use, so tests and servers without Sheets never pay for it. */
  private api(): Promise<SheetsApiSubset> {
    this.client ??= import('googleapis').then(({ google }) => {
      const auth = new google.auth.GoogleAuth({ keyFile: this.options.keyFile, scopes: SCOPES });
      return google.sheets({ version: 'v4', auth }) as unknown as SheetsApiSubset;
    });
    return this.client;
  }
}

/** Safe mapping: never forwards Google's message or body (contracts/sheets-gateway.md). */
export function mapGoogleError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const status = Number((error as { response?: { status?: unknown } })?.response?.status ?? (error as { status?: unknown })?.status);
  if (status === 403) return sheetsError('SHEET_NOT_SHARED');
  if (status === 404) return sheetsError('SHEET_NOT_FOUND');
  return sheetsError('SHEETS_UNAVAILABLE');
}

function readClientEmail(keyFile: string): string {
  const invalid = () => new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE could not be read as a Google service-account JSON key.');
  let parsed: { type?: unknown; client_email?: unknown };
  try { parsed = JSON.parse(readFileSync(keyFile, 'utf8')) as typeof parsed; } catch { throw invalid(); }
  if (parsed.type !== 'service_account' || typeof parsed.client_email !== 'string' || !parsed.client_email.includes('@')) throw invalid();
  return parsed.client_email;
}

function quoteTitle(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function a1ToIndex(a1: string): { row: number; column: number } {
  const match = /^([A-Z]{1,3})(\d{1,7})$/.exec(a1);
  if (!match) throw sheetsError('SHEET_NOT_FOUND');
  let column = 0;
  for (const char of match[1]) column = column * 26 + (char.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, column: column - 1 };
}
