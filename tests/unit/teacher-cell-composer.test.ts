import { describe, expect, it } from 'vitest';
import { composeCell } from '../../apps/server/src/modules/teacher/write-back/cell-composer.js';

describe('cell composer (pure)', () => {
  it('keeps the marker and puts the answer right after it', () => {
    expect(composeCell('（1）', [{ markerIndex: 0, answer: 'CPU' }])).toBe('（1）CPU');
  });

  it('writes the answer into an empty cell', () => {
    expect(composeCell('', [{ markerIndex: 0, answer: 'CPU' }])).toBe('CPU');
  });

  it('replaces a non-empty cell that has no marker', () => {
    expect(composeCell('請作答', [{ markerIndex: 0, answer: 'CPU' }])).toBe('CPU');
  });

  it('puts each answer after its own marker when one cell has several markers', () => {
    expect(composeCell('（1）＿＿＿（2）＿＿＿', [{ markerIndex: 0, answer: 'CPU' }, { markerIndex: 1, answer: 'OS' }]))
      .toBe('（1）CPU＿＿＿（2）OS＿＿＿');
    expect(composeCell('（1）＿＿＿（2）＿＿＿', [{ markerIndex: 1, answer: 'OS' }]))
      .toBe('（1）＿＿＿（2）OS＿＿＿');
  });

  it('handles half-width and spaced markers', () => {
    expect(composeCell('(1)', [{ markerIndex: 0, answer: 'CPU' }])).toBe('(1)CPU');
    expect(composeCell('( 2 )', [{ markerIndex: 0, answer: 'OS' }])).toBe('( 2 )OS');
  });

  it('always starts from the original, so rewriting replaces instead of appending', () => {
    const first = composeCell('（1）', [{ markerIndex: 0, answer: 'CPU' }]);
    const second = composeCell('（1）', [{ markerIndex: 0, answer: 'GPU' }]);
    expect(first).toBe('（1）CPU');
    expect(second).toBe('（1）GPU');
  });

  it('returns the original unchanged when there is no answer (restore)', () => {
    expect(composeCell('（1）', [])).toBe('（1）');
    expect(composeCell('', [])).toBe('');
  });
});
