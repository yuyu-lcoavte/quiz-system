import { HttpError } from '../../../errors/http-error.js';
import type { GridMerge } from '../guided-notes/parser.js';
import type { SheetRef } from '../guided-notes/sheet-url.js';

/** One tab: formatted values and merges (same shape the parser reads). */
export interface SheetTab {
  readonly sheetId: number;
  readonly sheetTitle: string;
  readonly values: string[][];
  readonly merges: GridMerge[];
}

/**
 * Every Google Sheets call goes through this interface (contracts/sheets-gateway.md).
 * Automated tests use tests/helpers/fake-sheets-gateway.ts; only manual tests reach Google.
 */
export interface SheetsGateway {
  readSheet(ref: SheetRef): Promise<SheetTab>;
  /** Current text of the cells; a cell outside the grid or on a deleted tab → null. */
  readCells(ref: { spreadsheetId: string; sheetId: number }, cellsA1: string[]): Promise<Record<string, string | null>>;
  /** All-or-nothing write of plain text. */
  writeCells(ref: { spreadsheetId: string; sheetId: number }, updates: { cellA1: string; text: string }[]): Promise<void>;
  serviceAccountEmail(): string | null;
}

export type SheetsErrorCode = 'SHEET_NOT_SHARED' | 'SHEET_NOT_FOUND' | 'SHEETS_UNAVAILABLE' | 'SHEETS_NOT_CONFIGURED';

const ERRORS: Record<SheetsErrorCode, [number, string]> = {
  SHEET_NOT_SHARED: [403, 'The spreadsheet is not shared with the service account.'],
  SHEET_NOT_FOUND: [404, 'The spreadsheet or tab was not found.'],
  SHEETS_UNAVAILABLE: [502, 'Google Sheets is temporarily unavailable.'],
  SHEETS_NOT_CONFIGURED: [503, 'Google Sheets is not configured on this server.'],
};

/** Safe errors only: no Google response body, key path or key content. */
export function sheetsError(code: SheetsErrorCode): HttpError {
  const [status, message] = ERRORS[code];
  return new HttpError(status, code, message);
}

export function requireGateway(gateway: SheetsGateway | null): SheetsGateway {
  if (!gateway) throw sheetsError('SHEETS_NOT_CONFIGURED');
  return gateway;
}
