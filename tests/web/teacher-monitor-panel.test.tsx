import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeacherMonitorView, TeacherResultView } from '@quiz/contracts';
import type { UUID } from '@quiz/contracts/domain';
import { MonitorPanel } from '../../apps/web/src/modules/teacher/MonitorPanel.js';
import { ResultsPanel } from '../../apps/web/src/modules/teacher/ResultsPanel.js';
import { ids } from '../helpers/foundation.js';

afterEach(() => vi.useRealTimers());

const monitor: TeacherMonitorView = {
  roundId: ids.round1,
  phase: 'Active',
  teams: [
    { teamId: ids.team2, teamName: '第2組', submitted: true, acceptedOrder: 1, receivedAt: '2026-11-22T01:00:00.000Z', answers: [{ blankId: ids.blank1, label: '（1）', value: 'SECRET-B' }] },
    { teamId: ids.team1, teamName: '第1組', submitted: false, acceptedOrder: null, receivedAt: null, answers: [] },
  ],
};

const result: TeacherResultView = {
  roundId: ids.round1,
  target: { kind: 'question', questionId: ids.question1 },
  number: '3',
  roundNumber: 1,
  submissions: [
    { teamId: ids.team2, teamName: '第2組', acceptedOrder: 1, receivedAt: '2026-11-22T01:00:00.000Z', answers: [{ blankId: ids.blank1, label: null, value: 'CPU' }] },
    { teamId: ids.team1, teamName: '第1組', acceptedOrder: 2, receivedAt: '2026-11-22T01:00:01.000Z', answers: [{ blankId: ids.blank1, label: null, value: 'GPU' }] },
  ],
  winner: { teamId: ids.team2, teamName: '第2組', answers: [{ blankId: ids.blank1, label: null, value: 'CPU' }] },
};

describe('MonitorPanel', () => {
  it('polls every second while Active and stops once the Round is no longer Active', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const load = vi.fn(async () => monitor);
    const { rerender } = render(<MonitorPanel phase="Active" roundId={ids.round1 as UUID} load={load} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(load).toHaveBeenCalledTimes(3);
    rerender(<MonitorPanel phase="Ended" roundId={ids.round1 as UUID} load={load} />);
    const after = load.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(load.mock.calls.length).toBeLessThanOrEqual(after + 1);
  });

  it('shows submitted status and order, hiding answers until 顯示答案 is pressed', async () => {
    render(<MonitorPanel phase="Active" roundId={ids.round1 as UUID} load={async () => monitor} />);
    expect(await screen.findByText('已送出')).toBeTruthy();
    expect(screen.getByText('未送出')).toBeTruthy();
    expect(screen.getByText('第 1 名')).toBeTruthy();
    expect(screen.queryByText(/SECRET-B/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '顯示答案' }));
    expect(screen.getByText(/SECRET-B/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '隱藏答案' }));
    expect(screen.queryByText(/SECRET-B/)).toBeNull();
  });
});

describe('MonitorPanel after End', () => {
  it('always shows answers once the Round has Ended (FR-022) and offers no hide toggle', async () => {
    render(<MonitorPanel phase="Ended" roundId={ids.round1 as UUID} load={async () => ({ ...monitor, phase: 'Ended' })} />);
    expect(await screen.findByText(/SECRET-B/)).toBeTruthy();
    expect(screen.queryByText('（已隱藏）')).toBeNull();
    expect(screen.queryByRole('button', { name: '顯示答案' })).toBeNull();
    expect(screen.queryByRole('button', { name: '隱藏答案' })).toBeNull();
  });

  it('reveals hidden answers when the phase changes from Active to Ended', async () => {
    const { rerender } = render(<MonitorPanel phase="Active" roundId={ids.round1 as UUID} load={async () => monitor} />);
    expect(await screen.findByText('（已隱藏）')).toBeTruthy();
    rerender(<MonitorPanel phase="Ended" roundId={ids.round1 as UUID} load={async () => ({ ...monitor, phase: 'Ended' })} />);
    expect(await screen.findByText(/SECRET-B/)).toBeTruthy();
  });
});

describe('ResultsPanel', () => {
  it('always shows the full order, the winner and answers after Ended', async () => {
    render(<ResultsPanel phase="Ended" roundId={ids.round1 as UUID} load={async () => result} />);
    expect(await screen.findByText(/勝出：第2組/)).toBeTruthy();
    expect(screen.getAllByText(/CPU/).length).toBeGreaterThan(0);
    expect(screen.getByText(/GPU/)).toBeTruthy();
    expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('第2組'), expect.stringContaining('第1組'),
    ]));
  });

  it('shows 無勝者 when nobody submitted', async () => {
    render(<ResultsPanel phase="Ended" roundId={ids.round1 as UUID} load={async () => ({ ...result, submissions: [], winner: null })} />);
    expect(await screen.findByText('無勝者')).toBeTruthy();
  });

  it('loads nothing before the Round has Ended', () => {
    const load = vi.fn(async () => result);
    render(<ResultsPanel phase="Active" roundId={ids.round1 as UUID} load={load} />);
    expect(load).not.toHaveBeenCalled();
  });
});
