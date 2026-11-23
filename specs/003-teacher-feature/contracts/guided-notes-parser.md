# Guided Notes Parser Contract (internal, pure function)

Location: `apps/server/src/modules/teacher/guided-notes/parser.ts`. No I/O, no clock, no randomness; same input → same output.

## Input

```ts
interface SheetGrid {
  sheetTitle: string;
  /** Formatted cell text; row 0 / column 0 = cell A1. Missing cells are ''. */
  values: string[][];
  /** Zero-based, end-exclusive, as returned by the Sheets API. */
  merges: { startRow: number; endRow: number; startColumn: number; endColumn: number }[];
}
```

## Output

```ts
type ParseResult =
  | { ok: true; targets: ParsedTarget[]; warnings: ParseWarning[] }
  | { ok: false; error: { code: 'SHEET_FORMAT_INVALID' | 'DUPLICATE_QUESTION_NUMBER'; message: string; cellA1?: string } };

interface ParsedTarget { number: string; kind: 'question' | 'questionGroup'; questions: ParsedQuestion[] }
interface ParsedQuestion { rowA1: number; blanks: ParsedBlank[] }      // rowA1 is 1-based
interface ParsedBlank {
  cellA1: string;            // cell the answer is written to (fill cell, or the marker cell)
  labelCellA1: string | null; // marker cell when the answer goes to a separate fill cell, else null
  marker: string | null;
  markerIndex: number;
  originalContent: string;   // original text of cellA1
}
```

`targets` keep sheet order; that order becomes target position.

## Rules

1. Text comparison uses NFKC-normalized, trimmed text; output keeps the original text.
2. Header row: the first row with a cell equal to `題號` and a cell equal to `作答`. A `題目` cell is optional. None found → `SHEET_FORMAT_INVALID`.
3. The cell for column X in row r is the top-left cell of the merge covering (r, X), or (r, X) itself.
4. Question rows: rows below the header whose `題號` cell value is non-empty, **excluding** rows where one merge covers both the `題號` and `作答` columns (spacer or section rows).
5. Consecutive rows whose `題號` cell comes from the same vertical merge form one `questionGroup` target with one question per row; other rows are `question` targets with one question.
6. Number: `/^\d+(\.0+)?$/` → integer text (`1.0` → `1`); otherwise trimmed text. A number used by two targets → `DUPLICATE_QUESTION_NUMBER` with the second cell's address.
7. Blanks: markers `/[（(]\s*(\d+)\s*[）)]/g` in the row's `作答` cell. No marker → one blank, `marker: null`, `markerIndex: 0`. k markers → k blanks, in order, `markerIndex` 0…k-1.
7a. Fill cells (Q16 clarification 2026-11-23): the 「作答」 column range is the header cell's merge (e.g. `G4:H4` → G..H; a single unmerged header → one column). When the row's answer cell holds exactly one marker and the next cell to its right (after the answer cell's own merge) is still inside that range, starts its own cell/merge on the same row and is empty, that cell is the blank's `cellA1` (original `''`) and the marker cell is `labelCellA1`. Otherwise the blank stays in the marker cell (`labelCellA1: null`). Columns are never fixed.
8. No question rows → `SHEET_FORMAT_INVALID`.
9. Warnings (not errors): rows after the last question with content in the `作答` column but no number; header found below row 20.

## Test fixtures (`tests/fixtures/guided-notes/`)

| Fixture | Expected |
|---|---|
| Single-question template (transcribed from `docs/examples/`) | 6 `question` targets, numbers 1–6, each one blank without marker in the `作答` anchor (`G5`, `G7`, …) |
| Question-group template | 4 targets: 1 and 2 are groups with 2 questions each; blanks in fill cells H5, H6, H8, H9 with labels G5, G6, G8, G9; 3 and 4 single questions (G11, G13) |
| Header moved to row 2, columns shifted by 2, extra column between | Same structure as the template it came from, addresses shifted (fill cells K3, K4) |
| 8 questions, one cell `（1）＿＿（2）＿＿` | that question has 2 blanks in that same cell (not a group; answers appended after markers) |
| Marker cell whose right cell is not empty | blank stays in the marker cell |
| Half-width `(1)` markers | Recognized like full-width |
| Missing `作答` header | `SHEET_FORMAT_INVALID` |
| Two rows numbered `3` | `DUPLICATE_QUESTION_NUMBER` |
| Header only | `SHEET_FORMAT_INVALID` |
