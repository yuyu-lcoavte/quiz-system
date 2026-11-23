import { HttpError } from '../../apps/server/src/errors/http-error.js';
import { columnLetters, type SheetGrid } from '../../apps/server/src/modules/teacher/guided-notes/parser.js';
import type { SheetRef } from '../../apps/server/src/modules/teacher/guided-notes/sheet-url.js';
import { sheetsError, type SheetsErrorCode, type SheetsGateway, type SheetTab } from '../../apps/server/src/modules/teacher/sheets/sheets-gateway.js';

/** In-memory SheetsGateway for automated tests (contracts/sheets-gateway.md). Never calls Google. */
export class FakeSheetsGateway implements SheetsGateway {
  readonly writes: { spreadsheetId: string; sheetId: number; updates: { cellA1: string; text: string }[] }[] = [];
  private readonly sheets = new Map<string, { sheetId: number; grid: SheetGrid }[]>();
  private failure: SheetsErrorCode | null = null;
  /** Runs before each readCells, e.g. to simulate another editor between preview and confirm. */
  beforeReadCells: (() => void) | null = null;

  constructor(private readonly email: string | null = 'quiz-system@test-project.iam.gserviceaccount.com') {}

  addSheet(spreadsheetId: string, sheetId: number, grid: SheetGrid): this {
    const tabs = this.sheets.get(spreadsheetId) ?? [];
    tabs.push({ sheetId, grid: structuredClone(grid) });
    this.sheets.set(spreadsheetId, tabs);
    return this;
  }

  failWith(code: SheetsErrorCode | null): this {
    this.failure = code;
    return this;
  }

  setCell(spreadsheetId: string, sheetId: number, cellA1: string, text: string): void {
    const tab = this.tab(spreadsheetId, sheetId);
    const { row, column } = parseA1(cellA1);
    while (tab.grid.values.length <= row) tab.grid.values.push([]);
    while (tab.grid.values[row].length <= column) tab.grid.values[row].push('');
    tab.grid.values[row][column] = text;
  }

  cell(spreadsheetId: string, sheetId: number, cellA1: string): string | null {
    const { row, column } = parseA1(cellA1);
    return this.tab(spreadsheetId, sheetId).grid.values[row]?.[column] ?? '';
  }

  async readSheet(ref: SheetRef): Promise<SheetTab> {
    this.throwIfFailing();
    const tabs = this.sheets.get(ref.spreadsheetId);
    if (!tabs) throw sheetsError('SHEET_NOT_FOUND');
    const tab = ref.sheetId === null ? tabs[0] : tabs.find((entry) => entry.sheetId === ref.sheetId);
    if (!tab) throw sheetsError('SHEET_NOT_FOUND');
    return { sheetId: tab.sheetId, ...structuredClone(tab.grid) };
  }

  async readCells(ref: { spreadsheetId: string; sheetId: number }, cellsA1: string[]): Promise<Record<string, string | null>> {
    this.beforeReadCells?.();
    this.throwIfFailing();
    const tab = this.tab(ref.spreadsheetId, ref.sheetId);
    const out: Record<string, string | null> = {};
    for (const a1 of cellsA1) {
      const { row, column } = parseA1(a1);
      out[a1] = row < tab.grid.values.length ? tab.grid.values[row]?.[column] ?? '' : null;
    }
    return out;
  }

  async writeCells(ref: { spreadsheetId: string; sheetId: number }, updates: { cellA1: string; text: string }[]): Promise<void> {
    this.throwIfFailing();
    for (const update of updates) this.setCell(ref.spreadsheetId, ref.sheetId, update.cellA1, update.text);
    this.writes.push({ ...ref, updates: [...updates] });
  }

  serviceAccountEmail(): string | null {
    return this.email;
  }

  private tab(spreadsheetId: string, sheetId: number) {
    const tab = this.sheets.get(spreadsheetId)?.find((entry) => entry.sheetId === sheetId);
    if (!tab) throw new HttpError(404, 'SHEET_NOT_FOUND', 'Sheet not found in fake gateway.');
    return tab;
  }

  private throwIfFailing() {
    if (this.failure) throw sheetsError(this.failure);
  }
}

function parseA1(a1: string) {
  const match = /^([A-Z]+)(\d+)$/.exec(a1);
  if (!match) throw new Error(`Bad cell ${a1}`);
  let column = 0;
  for (const char of match[1]) column = column * 26 + (char.charCodeAt(0) - 64);
  return { row: Number(match[2]) - 1, column: column - 1 };
}

export { columnLetters };
