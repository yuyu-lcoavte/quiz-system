import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionStateSnapshot } from '@quiz/contracts/domain';
import { TeacherDashboardPage } from '../../apps/web/src/pages/teacher/TeacherDashboardPage.js';
import { TeacherLoginPage } from '../../apps/web/src/pages/teacher/TeacherLoginPage.js';
import { TeacherSessionPage } from '../../apps/web/src/pages/teacher/TeacherSessionPage.js';
import type { SessionStateClient } from '../../apps/web/src/services/session-state-client.js';
import { ids } from '../helpers/foundation.js';

afterEach(() => vi.unstubAllGlobals());

type Reply = { status: number; body?: unknown };
type Handler = (path: string, init: RequestInit | undefined) => Reply;

function stubFetch(handler: Handler) {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    calls.push({ path, init });
    const reply = handler(path, init);
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  }));
  return calls;
}

const me: Reply = { status: 200, body: { data: { authenticated: true, csrfToken: 'csrf-1', expiresAt: '2099-01-01T00:00:00.000Z', serviceAccountEmail: null } } };
const error = (status: number, code: string): Reply => ({ status, body: { error: { code, message: 'server text' } } });

function snapshot(phase: 'Waiting' | 'Active' | 'Ended', stateVersion: number): SessionStateSnapshot {
  return { sessionId: ids.session1, phase, currentRoundId: ids.round1, target: { kind: 'question', questionId: ids.question1 }, stateVersion, changedAt: '2026-11-22T01:00:00.000Z' };
}

function detail(phase: 'Waiting' | 'Active' | 'Ended', stateVersion: number) {
  return {
    status: 200,
    body: { data: {
      sessionId: ids.session1, activityCode: 'ABCD23', state: snapshot(phase, stateVersion),
      teams: [{ teamId: ids.team1, name: '第1組' }, { teamId: ids.team2, name: '第2組' }],
      targets: [
        { target: { kind: 'questionGroup', questionGroupId: ids.group1 }, number: '1', kind: 'questionGroup', questionCount: 2, blankCount: 2, status: 'Ended', roundCount: 1, hasResult: true },
        { target: { kind: 'question', questionId: ids.question1 }, number: '3', kind: 'question', questionCount: 1, blankCount: 1, status: phase, roundCount: 1, hasResult: false },
        { target: { kind: 'question', questionId: ids.question2 }, number: '4', kind: 'question', questionCount: 1, blankCount: 1, status: 'NotOpened', roundCount: 0, hasResult: false },
      ],
      source: null,
    } },
  };
}

const fakeState = (): SessionStateClient => ({ getSnapshot: () => null, subscribe: () => () => {}, dispose: () => {} });

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teacher/login" element={<TeacherLoginPage />} />
        <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
        <Route path="/teacher/sessions/:sessionId" element={<TeacherSessionPage createStateClient={fakeState} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Teacher pages', () => {
  it('shows a login error and goes to the dashboard on success', async () => {
    let attempts = 0;
    stubFetch((path) => {
      if (path.endsWith('/auth/login')) return ++attempts === 1 ? error(401, 'INVALID_CREDENTIALS') : { status: 204 };
      if (path.endsWith('/sessions')) return { status: 200, body: { data: [] } };
      return me;
    });
    show('/teacher/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('密碼'), 'wrong');
    await user.click(screen.getByRole('button', { name: '登入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密碼錯誤');
    await user.clear(screen.getByLabelText('密碼'));
    await user.type(screen.getByLabelText('密碼'), 'right');
    await user.click(screen.getByRole('button', { name: '登入' }));
    expect(await screen.findByRole('heading', { name: '老師管理入口' })).toBeTruthy();
  });

  it('lists activities and creates one with the chosen team count', async () => {
    const calls = stubFetch((path, init) => {
      if (path.endsWith('/sessions') && init?.method === 'POST') {
        return { status: 201, body: { data: { sessionId: ids.session2, activityCode: 'NEW234', createdAt: '2026-11-22T02:00:00.000Z', teamCount: 3, phase: 'Waiting', imported: false } } };
      }
      if (path.endsWith('/sessions')) {
        return { status: 200, body: { data: [{ sessionId: ids.session1, activityCode: 'ABCD23', createdAt: '2026-11-22T01:00:00.000Z', teamCount: 2, phase: 'Waiting', imported: false }] } };
      }
      if (path.includes(`/sessions/${ids.session2}`)) return detail('Waiting', 0);
      return me;
    });
    show('/teacher/dashboard');
    expect(await screen.findByText('ABCD23')).toBeTruthy();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('組數'));
    await user.type(screen.getByLabelText('組數'), '3');
    await user.click(screen.getByRole('button', { name: '建立活動' }));
    await waitFor(() => expect(calls.some((call) => call.init?.method === 'POST' && call.path.endsWith('/sessions'))).toBe(true));
    const post = calls.find((call) => call.init?.method === 'POST' && call.path.endsWith('/sessions'))!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ teamCount: 3 });
    expect((post.init!.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
    expect(post.init!.credentials).toBe('same-origin');
    expect(await screen.findByRole('heading', { name: '活動管理' })).toBeTruthy();
  });

  it('shows target statuses and enables only the buttons that fit the phase', async () => {
    stubFetch((path) => (path.includes(`/sessions/${ids.session1}`) ? detail('Waiting', 4) : me));
    show(`/teacher/sessions/${ids.session1}`);
    expect(await screen.findByText('ABCD23')).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('已結束'), expect.stringContaining('等待中'), expect.stringContaining('未開放'),
    ]));
    expect(screen.getByRole('button', { name: '開始搶答' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '結束搶答' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一題' })).toBeDisabled();
  });

  it('sends the current state version and refetches after a 409', async () => {
    let version = 4;
    const calls = stubFetch((path, init) => {
      if (path.endsWith('/rounds/start')) { version = 5; return error(409, 'STALE_STATE'); }
      if (path.includes(`/sessions/${ids.session1}`)) return detail(version === 4 ? 'Waiting' : 'Active', version);
      return me;
    });
    show(`/teacher/sessions/${ids.session1}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '開始搶答' }));
    const start = calls.find((call) => call.path.endsWith('/rounds/start'))!;
    expect(JSON.parse(String(start.init!.body))).toEqual({ expectedStateVersion: 4 });
    expect(await screen.findByRole('alert')).toHaveTextContent('狀態已更新');
    expect(await screen.findByRole('button', { name: '結束搶答' })).toBeEnabled();
    expect(calls.filter((call) => call.path.endsWith(`/sessions/${ids.session1}`)).length).toBeGreaterThanOrEqual(2);
  });

  it('redirects to the login page when the Teacher API answers 401', async () => {
    stubFetch(() => error(401, 'UNAUTHENTICATED'));
    show('/teacher/dashboard');
    expect(await screen.findByRole('heading', { name: '老師登入入口' })).toBeTruthy();
  });
});
