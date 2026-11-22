import { describe, expect, it } from 'vitest';
import { TEACHER_API_ERROR_CODES } from '../../packages/contracts/src/teacher.js';
import { TEACHER_ERROR_FALLBACK, teacherErrorMessage } from '../../apps/web/src/modules/teacher/error-messages.js';

describe('Teacher error messages', () => {
  it('has a Chinese message for every Teacher error code', () => {
    for (const code of TEACHER_API_ERROR_CODES) {
      const message = teacherErrorMessage(code);
      expect(message, code).not.toBe(TEACHER_ERROR_FALLBACK);
      expect(message, code).toMatch(/[一-鿿]/);
      expect(message, code).not.toContain(code);
      expect(message, code).not.toMatch(/stack|Error:|SQLITE|undefined/i);
    }
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(teacherErrorMessage('SOMETHING_NEW')).toBe(TEACHER_ERROR_FALLBACK);
    expect(teacherErrorMessage(undefined)).toBe(TEACHER_ERROR_FALLBACK);
  });

  it('adds only cell addresses from details for sheet conflicts', () => {
    const message = teacherErrorMessage('SHEET_CONFLICT', { cells: [{ cellA1: 'G5', expected: 'secret-a', actual: 'secret-b' }, { cellA1: 'G7' }] });
    expect(message).toContain('G5');
    expect(message).toContain('G7');
    expect(message).not.toContain('secret');
  });

  it('adds the problem cell for sheet format errors when given', () => {
    expect(teacherErrorMessage('DUPLICATE_QUESTION_NUMBER', { cellA1: 'B9' })).toContain('B9');
  });
});
