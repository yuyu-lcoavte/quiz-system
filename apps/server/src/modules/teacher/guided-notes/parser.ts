/**
 * Pure Guided Notes parser (contracts/guided-notes-parser.md). No I/O, no clock, no randomness.
 * Structure comes from header text, merges and blank markers — never fixed cell positions or counts.
 */

/** Zero-based, end-exclusive, as returned by the Sheets API. */
export interface GridMerge { startRow: number; endRow: number; startColumn: number; endColumn: number }

export interface SheetGrid {
  sheetTitle: string;
  /** Formatted cell text; row 0 / column 0 = A1. Missing cells are ''. */
  values: string[][];
  merges: GridMerge[];
}

export interface ParsedBlank {
  /** Cell the answer is written to: the fill cell when the template has one, else the marker cell. */
  cellA1: string;
  /** Marker (label) cell when the answer goes to a separate fill cell; null otherwise. */
  labelCellA1: string | null;
  marker: string | null;
  markerIndex: number;
  /** Original text of `cellA1`. */
  originalContent: string;
}
export interface ParsedQuestion { rowA1: number; blanks: ParsedBlank[] }
export interface ParsedTarget { number: string; kind: 'question' | 'questionGroup'; questions: ParsedQuestion[] }
export interface ParseWarning { message: string; cellA1?: string }

export type ParseResult =
  | { ok: true; targets: ParsedTarget[]; warnings: ParseWarning[] }
  | { ok: false; error: { code: 'SHEET_FORMAT_INVALID' | 'DUPLICATE_QUESTION_NUMBER'; message: string; cellA1?: string } };

const MARKER = /[（(]\s*(\d+)\s*[）)]/g;
const LATE_HEADER_ROW = 20;

export function columnLetters(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

export function toA1(row: number, column: number): string {
  return `${columnLetters(column)}${row + 1}`;
}

const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, '');

/** 1, 1.0, 1.00 → "1"; anything else trimmed as is. */
export function normalizeNumber(text: string): string {
  const trimmed = text.trim();
  return /^\d+(\.0+)?$/.test(trimmed) ? String(Number.parseInt(trimmed, 10)) : trimmed;
}

export function parseGuidedNotes(grid: SheetGrid): ParseResult {
  const cell = (row: number, column: number) => grid.values[row]?.[column] ?? '';
  const mergeAt = (row: number, column: number) =>
    grid.merges.find((m) => row >= m.startRow && row < m.endRow && column >= m.startColumn && column < m.endColumn);
  const anchor = (row: number, column: number) => {
    const merge = mergeAt(row, column);
    return merge ? { row: merge.startRow, column: merge.startColumn, merge } : { row, column, merge: undefined };
  };

  // 1. Header row: first row with both 題號 and 作答 (題目 optional).
  let header: { row: number; numberColumn: number; answerColumn: number } | null = null;
  for (let row = 0; row < grid.values.length && !header; row += 1) {
    const cells = grid.values[row] ?? [];
    const numberColumn = cells.findIndex((text) => normalize(text) === '題號');
    const answerColumn = cells.findIndex((text) => normalize(text) === '作答');
    if (numberColumn >= 0 && answerColumn >= 0) header = { row, numberColumn, answerColumn };
  }
  if (!header) {
    return { ok: false, error: { code: 'SHEET_FORMAT_INVALID', message: 'No header row with 「題號」 and 「作答」 was found.' } };
  }

  // 「作答」 column range = the header cell's merge (e.g. G4:H4 → G..H); an unmerged header is one column.
  const answerHeader = mergeAt(header.row, header.answerColumn);
  const answerRange = answerHeader
    ? { first: answerHeader.startColumn, end: answerHeader.endColumn }
    : { first: header.answerColumn, end: header.answerColumn + 1 };

  const warnings: ParseWarning[] = [];
  if (header.row >= LATE_HEADER_ROW) warnings.push({ message: 'The header row is unusually far down.', cellA1: toA1(header.row, header.numberColumn) });

  const targets: ParsedTarget[] = [];
  const groupTargets = new Map<string, ParsedTarget>();
  const seenNumbers = new Set<string>();
  const lastRow = grid.values.length - 1;

  for (let row = header.row + 1; row <= lastRow; row += 1) {
    const numberAnchor = anchor(row, header.numberColumn);
    const answerAnchor = anchor(row, header.answerColumn);
    // Spacer / section rows: one merge covers both the 題號 and 作答 columns.
    if (numberAnchor.merge && numberAnchor.merge === answerAnchor.merge) continue;

    const number = normalizeNumber(cell(numberAnchor.row, numberAnchor.column));
    const answerText = cell(answerAnchor.row, answerAnchor.column);
    if (!number) {
      if (answerAnchor.row === row && answerText.trim()) {
        warnings.push({ message: 'This row has an answer cell but no question number; it was ignored.', cellA1: toA1(row, header.answerColumn) });
      }
      continue;
    }
    // A row whose answer cell belongs to a merge started on an earlier row has no answer cell of its own.
    if (answerAnchor.row !== row) continue;

    const question: ParsedQuestion = {
      rowA1: row + 1,
      blanks: blanksOf(answerText, toA1(answerAnchor.row, answerAnchor.column), fillCellRightOf(row, answerAnchor)),
    };
    const vertical = numberAnchor.merge && numberAnchor.merge.endRow - numberAnchor.merge.startRow > 1;

    if (vertical) {
      const key = `${numberAnchor.row}:${numberAnchor.column}`;
      const existing = groupTargets.get(key);
      if (existing) { existing.questions.push(question); continue; }
      if (seenNumbers.has(number)) return duplicate(number, toA1(numberAnchor.row, numberAnchor.column));
      const target: ParsedTarget = { number, kind: 'questionGroup', questions: [question] };
      groupTargets.set(key, target);
      seenNumbers.add(number);
      targets.push(target);
    } else {
      if (seenNumbers.has(number)) return duplicate(number, toA1(numberAnchor.row, numberAnchor.column));
      seenNumbers.add(number);
      targets.push({ number, kind: 'question', questions: [question] });
    }
  }

  if (targets.length === 0) {
    return { ok: false, error: { code: 'SHEET_FORMAT_INVALID', message: 'No question rows were found below the header.' } };
  }
  return { ok: true, targets, warnings };

  /**
   * Q16 clarification: the next cell right of the answer cell (after its own merge), still inside the 「作答」 range,
   * starting its own cell/merge on this row and empty, is the fill cell. Returns its A1 address, or null.
   */
  function fillCellRightOf(row: number, answer: { row: number; column: number; merge?: GridMerge }): string | null {
    const column = answer.merge ? answer.merge.endColumn : answer.column + 1;
    if (column >= answerRange.end) return null;
    const own = anchor(row, column);
    if (own.row !== row || own.column !== column) return null;
    return cell(row, column).trim() === '' ? toA1(row, column) : null;
  }
}

function blanksOf(text: string, cellA1: string, fillCellA1: string | null): ParsedBlank[] {
  const markers = [...text.matchAll(MARKER)].map((match) => match[0]);
  if (markers.length === 0) return [{ cellA1, labelCellA1: null, marker: null, markerIndex: 0, originalContent: text }];
  if (markers.length === 1 && fillCellA1) {
    return [{ cellA1: fillCellA1, labelCellA1: cellA1, marker: markers[0], markerIndex: 0, originalContent: '' }];
  }
  return markers.map((marker, markerIndex) => ({ cellA1, labelCellA1: null, marker, markerIndex, originalContent: text }));
}

function duplicate(number: string, cellA1: string): ParseResult {
  return { ok: false, error: { code: 'DUPLICATE_QUESTION_NUMBER', message: `Question number ${number} appears more than once.`, cellA1 } };
}
