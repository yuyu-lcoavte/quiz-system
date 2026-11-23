/**
 * Pure: builds a cell's new text from its imported original (FR-034, research.md R13).
 * - Cell with markers: keep every marker and the other text; put each blank's answer right after its marker.
 * - Cell without a marker: the answer replaces the whole cell.
 * - Fill cell (Q16 clarification): its original is empty, so the answer is written as is; the marker cell is never touched.
 * Always starts from the original, so writing again after a reopen replaces the old answer instead of appending.
 * No answers → the original (used to restore a cell whose target no longer has a winner).
 */
const MARKER = /[（(]\s*\d+\s*[）)]/g;

export interface ComposeAnswer {
  /** Order of the blank's marker in the cell (0 when the cell has no marker). */
  readonly markerIndex: number;
  readonly answer: string;
}

export function composeCell(original: string, answers: readonly ComposeAnswer[]): string {
  if (answers.length === 0) return original;
  const byIndex = new Map(answers.map((entry) => [entry.markerIndex, entry.answer]));
  const markers = [...original.matchAll(MARKER)];
  if (markers.length === 0) return byIndex.get(0) ?? original;

  let result = '';
  let cursor = 0;
  markers.forEach((match, index) => {
    const end = (match.index ?? 0) + match[0].length;
    result += original.slice(cursor, end) + (byIndex.get(index) ?? '');
    cursor = end;
  });
  return result + original.slice(cursor);
}
