import { describe, expect, it } from 'vitest';
import { parseGuidedNotes, type ParseResult } from '../../apps/server/src/modules/teacher/guided-notes/parser.js';
import {
  DUPLICATE_NUMBER,
  EIGHT_WITH_MULTI_BLANK,
  GROUP_TEMPLATE,
  HALF_WIDTH_GROUP,
  HEADER_ONLY,
  MISSING_ANSWER_HEADER,
  NO_PROMPT_HEADER,
  SHIFTED_GROUP,
  SINGLE_TEMPLATE,
} from '../fixtures/guided-notes/index.js';

function ok(result: ParseResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result;
}

const summary = (result: ParseResult) => ok(result).targets.map((target) => ({
  number: target.number,
  kind: target.kind,
  rows: target.questions.map((question) => question.rowA1),
  blanks: target.questions.map((question) => question.blanks.map((blank) => `${blank.cellA1}|${blank.marker ?? '-'}|${blank.markerIndex}`)),
}));

describe('Guided Notes parser (pure)', () => {
  it('reads the single-question template: six numbers, one unmarked blank each in the 作答 anchor', () => {
    expect(summary(parseGuidedNotes(SINGLE_TEMPLATE))).toEqual(['1', '2', '3', '4', '5', '6'].map((number, index) => ({
      number, kind: 'question', rows: [5 + index * 2], blanks: [[`G${5 + index * 2}|-|0`]],
    })));
  });

  it('reads the question-group template: 1 and 2 are groups of two marked questions, 3 and 4 single', () => {
    expect(summary(parseGuidedNotes(GROUP_TEMPLATE))).toEqual([
      { number: '1', kind: 'questionGroup', rows: [5, 6], blanks: [['G5|（1）|0'], ['G6|（2）|0']] },
      { number: '2', kind: 'questionGroup', rows: [8, 9], blanks: [['G8|（1）|0'], ['G9|（2）|0']] },
      { number: '3', kind: 'question', rows: [11], blanks: [['G11|-|0']] },
      { number: '4', kind: 'question', rows: [13], blanks: [['G13|-|0']] },
    ]);
    const first = ok(parseGuidedNotes(GROUP_TEMPLATE)).targets[0].questions[0].blanks[0];
    expect(first.originalContent).toBe('（1）');
  });

  it('finds headers anywhere and ignores extra columns (no fixed positions)', () => {
    expect(summary(parseGuidedNotes(SHIFTED_GROUP))).toEqual([
      { number: '1', kind: 'questionGroup', rows: [3, 4], blanks: [['J3|（1）|0'], ['J4|（2）|0']] },
      { number: '2', kind: 'question', rows: [5], blanks: [['J5|-|0']] },
    ]);
  });

  it('treats several markers in one answer cell as one question with several blanks, not a group', () => {
    const targets = summary(parseGuidedNotes(EIGHT_WITH_MULTI_BLANK));
    expect(targets).toHaveLength(8);
    expect(targets.every((target) => target.kind === 'question')).toBe(true);
    expect(targets[4]).toEqual({ number: '5', kind: 'question', rows: [6], blanks: [['C6|（1）|0', 'C6|（2）|1']] });
  });

  it('accepts half-width markers', () => {
    expect(summary(parseGuidedNotes(HALF_WIDTH_GROUP))).toEqual([
      { number: '1', kind: 'questionGroup', rows: [2, 3], blanks: [['C2|(1)|0'], ['C3|( 2 )|0']] },
    ]);
  });

  it('works without a 題目 header', () => {
    expect(summary(parseGuidedNotes(NO_PROMPT_HEADER)).map((target) => target.number)).toEqual(['1', '2']);
  });

  it('rejects a sheet without the 作答 header with SHEET_FORMAT_INVALID', () => {
    const result = parseGuidedNotes(MISSING_ANSWER_HEADER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SHEET_FORMAT_INVALID');
  });

  it('rejects a header with no question rows with SHEET_FORMAT_INVALID', () => {
    const result = parseGuidedNotes(HEADER_ONLY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SHEET_FORMAT_INVALID');
  });

  it('rejects duplicate numbers with DUPLICATE_QUESTION_NUMBER and the second cell', () => {
    const result = parseGuidedNotes(DUPLICATE_NUMBER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'DUPLICATE_QUESTION_NUMBER', cellA1: 'A4' });
  });

  it('is deterministic', () => {
    expect(parseGuidedNotes(GROUP_TEMPLATE)).toEqual(parseGuidedNotes(GROUP_TEMPLATE));
  });
});
