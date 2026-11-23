import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WriteBackPlanView } from '@quiz/contracts';
import { WriteBackDialog } from '../../apps/web/src/modules/teacher/WriteBackDialog.js';
import { TeacherApiError } from '../../apps/web/src/modules/teacher/teacher-api-client.js';
import { teacherErrorMessage } from '../../apps/web/src/modules/teacher/error-messages.js';

const plan: WriteBackPlanView = {
  entries: [
    { cellA1: 'G5', currentContent: '（1）', newContent: '（1）CPU', kind: 'write', number: '1' },
    { cellA1: 'G11', currentContent: '42', newContent: '', kind: 'restore', number: '3' },
  ],
  planDigest: 'b'.repeat(64),
};

function show(overrides: Partial<Parameters<typeof WriteBackDialog>[0]> = {}) {
  const props = { preview: vi.fn(async () => plan), confirm: vi.fn(async () => ({ written: 2 })), ...overrides };
  render(<WriteBackDialog {...props} />);
  return props;
}

describe('WriteBackDialog', () => {
  it('lists every cell with current → new content and kind before writing', async () => {
    const props = show();
    await userEvent.click(screen.getByRole('button', { name: '寫回 Guided Notes' }));
    const rows = (await screen.findAllByRole('row')).map((row) => row.textContent ?? '');
    expect(rows.some((row) => row.includes('G5') && row.includes('（1）') && row.includes('（1）CPU') && row.includes('寫入'))).toBe(true);
    expect(rows.some((row) => row.includes('G11') && row.includes('還原'))).toBe(true);
    expect(props.confirm).not.toHaveBeenCalled();
  });

  it('writes with the plan digest only after confirmation and reports the count', async () => {
    const props = show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '寫回 Guided Notes' }));
    await user.click(await screen.findByRole('button', { name: '確認寫入' }));
    expect(props.confirm).toHaveBeenCalledWith('b'.repeat(64));
    expect(await screen.findByText(/已寫入 2 格/)).toBeTruthy();
  });

  it('shows the conflicting cells and writes nothing on SHEET_CONFLICT', async () => {
    const details = { cells: [{ cellA1: 'G5', expected: '（1）', actual: 'x' }] };
    show({ confirm: vi.fn(async () => { throw new TeacherApiError(409, 'SHEET_CONFLICT', teacherErrorMessage('SHEET_CONFLICT', details), details); }) });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '寫回 Guided Notes' }));
    await user.click(await screen.findByRole('button', { name: '確認寫入' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('沒有寫入任何儲存格');
    expect(alert).toHaveTextContent('G5');
  });

  it('cancels without writing', async () => {
    const props = show();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '寫回 Guided Notes' }));
    await user.click(await screen.findByRole('button', { name: '取消' }));
    expect(screen.queryByRole('button', { name: '確認寫入' })).toBeNull();
    expect(props.confirm).not.toHaveBeenCalled();
  });

  it('shows NOTHING_TO_WRITE as a message', async () => {
    show({ preview: vi.fn(async () => { throw new TeacherApiError(409, 'NOTHING_TO_WRITE', teacherErrorMessage('NOTHING_TO_WRITE')); }) });
    await userEvent.click(screen.getByRole('button', { name: '寫回 Guided Notes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('沒有需要寫回');
  });
});
