import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImportPreviewView } from '@quiz/contracts';
import { ImportWizard } from '../../apps/web/src/modules/teacher/ImportWizard.js';
import { TeacherApiError } from '../../apps/web/src/modules/teacher/teacher-api-client.js';
import { teacherErrorMessage } from '../../apps/web/src/modules/teacher/error-messages.js';

const URL = 'https://docs.google.com/spreadsheets/d/1TestSpreadsheetId_abcdefghijklmnop/edit#gid=0';
const EMAIL = 'quiz-system@test-project.iam.gserviceaccount.com';

const preview: ImportPreviewView = {
  spreadsheetId: '1TestSpreadsheetId_abcdefghijklmnop',
  sheetId: 0,
  sheetTitle: '學習單',
  questionNumberCount: 3,
  targets: [
    { number: '1', kind: 'questionGroup', questions: [
      { row: 5, blanks: [{ cellA1: 'H5', labelCellA1: 'G5', marker: '（1）', originalContent: '' }] },
      { row: 6, blanks: [{ cellA1: 'H6', labelCellA1: 'G6', marker: '（2）', originalContent: '' }] },
    ] },
    { number: '3', kind: 'question', questions: [{ row: 11, blanks: [{ cellA1: 'G11', labelCellA1: null, marker: null, originalContent: '' }] }] },
    { number: '5', kind: 'question', questions: [{ row: 15, blanks: [
      { cellA1: 'G15', labelCellA1: null, marker: '（1）', originalContent: '（1）＿（2）＿' },
      { cellA1: 'G15', labelCellA1: null, marker: '（2）', originalContent: '（1）＿（2）＿' },
    ] }] },
  ],
  warnings: ['G20: This row has an answer cell but no question number; it was ignored.'],
  previewDigest: 'a'.repeat(64),
};

function show(overrides: Partial<Parameters<typeof ImportWizard>[0]> = {}) {
  const props = {
    serviceAccountEmail: EMAIL,
    locked: false,
    preview: vi.fn(async () => preview),
    confirm: vi.fn(async () => undefined),
    onImported: vi.fn(),
    ...overrides,
  };
  render(<ImportWizard {...props} />);
  return props;
}

describe('ImportWizard', () => {
  it('shows the service-account email and sharing steps', () => {
    show();
    expect(screen.getByText(EMAIL)).toBeTruthy();
    expect(screen.getByText(/共用/)).toBeTruthy();
  });

  it('previews numbers, groups and blank cells, then confirms with the preview digest', async () => {
    const props = show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('試算表網址'), URL);
    await user.click(screen.getByRole('button', { name: '預覽' }));
    expect(props.preview).toHaveBeenCalledWith(URL);
    expect(await screen.findByText(/共 3 題/)).toBeTruthy();
    const rows = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    expect(rows.some((row) => row.includes('題組') && row.includes('G5（1）→H5（空白）') && row.includes('G6（2）→H6（空白）'))).toBe(true);
    expect(rows.some((row) => row.includes('單題') && row.includes('G11（空白）'))).toBe(true);
    // Two markers in one cell: the cell and its original content are shown once.
    const multi = rows.find((row) => row.includes('G15'))!;
    expect(multi).toContain('G15：（1）＿（2）＿');
    expect(multi.match(/G15/g)).toHaveLength(1);
    expect(screen.getByText(/G20/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '確認匯入' }));
    expect(props.confirm).toHaveBeenCalledWith(URL, 'a'.repeat(64));
    expect(props.onImported).toHaveBeenCalled();
  });

  it('cancels a preview without importing', async () => {
    const props = show();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('試算表網址'), URL);
    await user.click(screen.getByRole('button', { name: '預覽' }));
    await user.click(await screen.findByRole('button', { name: '取消' }));
    expect(screen.queryByRole('button', { name: '確認匯入' })).toBeNull();
    expect(props.confirm).not.toHaveBeenCalled();
  });

  it('shows the message for each error code', async () => {
    show({ preview: vi.fn(async () => { throw new TeacherApiError(403, 'SHEET_NOT_SHARED', teacherErrorMessage('SHEET_NOT_SHARED')); }) });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('試算表網址'), URL);
    await user.click(screen.getByRole('button', { name: '預覽' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未共用給系統的服務帳號');
  });

  it('explains that Sheets is not configured when there is no service account', () => {
    show({ serviceAccountEmail: null });
    expect(screen.getByText(/尚未設定 Google 服務帳號/)).toBeTruthy();
    expect(screen.queryByLabelText('試算表網址')).toBeNull();
  });

  it('explains that import is locked once a round has started', () => {
    show({ locked: true });
    expect(screen.getByText(/不能再匯入/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '預覽' })).toBeNull();
  });
});
