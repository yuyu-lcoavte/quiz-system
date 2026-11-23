import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TargetStatusView } from '@quiz/contracts';
import { TargetList } from '../../apps/web/src/modules/teacher/TargetList.js';
import { ids } from '../helpers/foundation.js';

const target = (number: string, status: TargetStatusView['status'], id: string): TargetStatusView => ({
  target: { kind: 'question', questionId: id as TargetStatusView['target'] extends { questionId: infer T } ? T : never },
  number, kind: 'question', questionCount: 1, blankCount: 1, status, roundCount: status === 'NotOpened' ? 0 : 1, hasResult: false,
});

function rows(statusOfSecond: TargetStatusView['status']) {
  render(<TargetList
    targets={[target('1', 'Ended', ids.question1), target('2', statusOfSecond, ids.question2), target('3', 'NotOpened', ids.question3)]}
    canSelect={statusOfSecond === 'Ended'} busy={false} onSelect={() => undefined}
  />);
  return screen.getAllByRole('row').slice(1);
}

describe('TargetList current-round highlight', () => {
  it.each(['Waiting', 'Active'] as const)('marks the %s target row: bold, light background and ▶ before the number', (status) => {
    const [first, current, third] = rows(status);
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current.className).toMatch(/font-bold/);
    expect(current.className).toMatch(/bg-indigo-50/);
    expect(current.cells[0].textContent).toBe('▶ 2');
    for (const other of [first, third]) {
      expect(other).not.toHaveAttribute('aria-current');
      expect(other.className).not.toMatch(/font-bold|bg-indigo-50/);
      expect(other.cells[0].textContent).not.toContain('▶');
    }
  });

  it('marks no row when no round is Waiting or Active', () => {
    const all = rows('Ended');
    expect(all.some((row) => row.hasAttribute('aria-current'))).toBe(false);
    expect(all.map((row) => row.cells[0].textContent)).toEqual(['1', '2', '3']);
  });
});
