/**
 * Guided Notes test grids (values + merges) for the pure parser.
 * The two templates transcribe the cell layout and merges of docs/examples/*.xlsx (prompt text shortened).
 * Values are formatted text as the Sheets API returns them; numbers may come back as "1" or "1.0".
 */

export interface GridMerge { startRow: number; endRow: number; startColumn: number; endColumn: number }
export interface SheetGrid { sheetTitle: string; values: string[][]; merges: GridMerge[] }

function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function parseA1(a1: string): { row: number; column: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(a1);
  if (!match) throw new Error(`Bad cell ${a1}`);
  return { row: Number(match[2]) - 1, column: columnIndex(match[1]) };
}

/** Build a grid from `{ A1: text }` and `['B5:B6', ...]` (zero-based, end-exclusive merges like the Sheets API). */
export function grid(cells: Record<string, string>, merges: string[] = [], sheetTitle = '學習單'): SheetGrid {
  const values: string[][] = [];
  for (const [a1, text] of Object.entries(cells)) {
    const { row, column } = parseA1(a1);
    while (values.length <= row) values.push([]);
    while (values[row].length <= column) values[row].push('');
    values[row][column] = text;
  }
  return {
    sheetTitle,
    values,
    merges: merges.map((range) => {
      const [from, to] = range.split(':').map(parseA1);
      return { startRow: from.row, endRow: to.row + 1, startColumn: from.column, endColumn: to.column + 1 };
    }),
  };
}

const HEADER = { B2: '計算機概論 學習單', B4: '題號', C4: '題目', G4: '作答' };
const HEADER_MERGES = ['B2:H2', 'C4:F4', 'G4:H4'];

/** 軟工期末專案_單題_範例.xlsx: six single questions on rows 5,7,…,15; spacer rows merged B:H; answers G:H empty. */
export const SINGLE_TEMPLATE = grid(
  {
    ...HEADER,
    B5: '1.0', C5: '題目一', B7: '2.0', C7: '題目二', B9: '3.0', C9: '題目三',
    B11: '4.0', C11: '題目四', B13: '5.0', C13: '題目五', B15: '6.0', C15: '題目六',
  },
  [
    ...HEADER_MERGES,
    'C5:F5', 'G5:H5', 'B6:H6', 'C7:F7', 'G7:H7', 'B8:H8', 'C9:F9', 'G9:H9', 'B10:H10',
    'C11:F11', 'G11:H11', 'B12:H12', 'C13:F13', 'G13:H13', 'B14:H14', 'C15:F15', 'G15:H15',
  ],
);

/** 軟工期末專案_題組_範例.xlsx: 1 (B5:B6) and 2 (B8:B9) are groups with （1）/（2）; 3 and 4 single. Rows 7,10,12 blank. */
export const GROUP_TEMPLATE = grid(
  {
    ...HEADER,
    B5: '1.0', C5: '題目1-1', G5: '（1）', C6: '題目1-2', G6: '（2）',
    B8: '2.0', C8: '題目2-1', G8: '（1）', C9: '題目2-2', G9: '（2）',
    B11: '3.0', C11: '題目三', B13: '4.0', C13: '題目四',
  },
  [...HEADER_MERGES, 'B5:B6', 'C5:F5', 'C6:F6', 'B8:B9', 'C8:F8', 'C9:F9', 'C11:F11', 'G11:H11', 'C13:F13', 'G13:H13'],
);

/** Group template layout moved: header on row 2, columns shifted right by 2 (D/E, 作答 J2:K2), an extra column I, numbers as "1". */
export const SHIFTED_GROUP = grid(
  {
    D2: '題號', E2: '題目', I2: '備註', J2: '作答',
    D3: '1', E3: '題目1-1', J3: '（1）', E4: '題目1-2', J4: '（2）',
    D5: '2', E5: '題目二', I5: '老師備註',
  },
  ['E2:H2', 'J2:K2', 'D3:D4', 'E3:H3', 'E4:H4', 'E5:H5', 'J5:K5'],
  '工作表2',
);

/** Eight single questions; question 5 has two blanks in one answer cell (one question, not a group). */
export const EIGHT_WITH_MULTI_BLANK = grid({
  A1: '題號', B1: '題目', C1: '作答',
  A2: '1', A3: '2', A4: '3', A5: '4', A6: '5', C6: '（1）＿＿＿（2）＿＿＿', A7: '6', A8: '7', A9: '8',
});

/** Half-width markers in a group. */
export const HALF_WIDTH_GROUP = grid(
  { A1: '題號', B1: '題目', C1: '作答', A2: '1', C2: '(1)', C3: '( 2 )' },
  ['A2:A3'],
);

/** 作答 spans C:D. Row 2: right cell has text → marker cell. Row 3: empty right cell → fill cell D3. Row 4: two markers → same cell C4. */
export const RIGHT_CELL_NOT_EMPTY = grid(
  { A1: '題號', B1: '題目', C1: '作答', A2: '1', C2: '（1）', D2: '已填', A3: '2', C3: '（1）', A4: '3', C4: '（1）＿（2）＿' },
  ['C1:D1'],
);

export const MISSING_ANSWER_HEADER = grid({ A1: '題號', B1: '題目', A2: '1', A3: '2' });

export const DUPLICATE_NUMBER = grid({ A1: '題號', B1: '題目', C1: '作答', A2: '1', A3: '3', A4: '3' });

export const HEADER_ONLY = grid({ A1: '題號', B1: '題目', C1: '作答' });

/** Header row without 題目 (FR-027: 題目 may be omitted). */
export const NO_PROMPT_HEADER = grid({ A1: '題號', B1: '作答', A2: '1', A3: '2', B3: '（1）' });
