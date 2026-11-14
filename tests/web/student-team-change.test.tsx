import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ids } from '../helpers/foundation.js';

const activity = vi.hoisted(() => ({ phase: 'Waiting', refreshSnapshot: vi.fn() }));
vi.mock('../../apps/web/src/modules/student/student-session-state.js', () => ({
  useStudentSessionStatus: () => ({ snapshot: { phase: activity.phase, stateVersion: 1 }, connected: true, refreshSnapshot: activity.refreshSnapshot }),
}));
import { StudentSessionPlaceholder } from '../../apps/web/src/pages/StudentSessionPlaceholder.js';

const source = { teamId: ids.team1, name: '原組' };
const destination = { teamId: ids.team2, name: '新組' };

afterEach(() => { vi.unstubAllGlobals(); activity.phase = 'Waiting'; activity.refreshSnapshot.mockClear(); });

function show({leader = false, allowed = true, reject = false} = {}) {
  let moved = false;
  const initial = { sessionId: ids.session1, participantId: ids.participant1, team: source, isLeader: leader };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/team-change')) {
      if (reject) {
        allowed = false;
        return { ok:false, status:409, json:async () => ({error:{code:'INVALID_PHASE', message:'Started'}}) };
      }
      moved = true;
      return { ok:true, json:async () => ({data:{ ...initial, team:destination, isLeader:!leader }}) };
    }
    return { ok:true, json:async () => ({
      data:url.endsWith('/csrf-token') ? { csrfToken:'csrf' } : {
        ...initial, team:moved ? destination : source, isLeader:moved ? !leader : leader,
        teamChange:allowed ? { teams:[moved ? source : destination] } : null,
      },
    }) };
  });
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={[`/student/session/${ids.session1}`]}><Routes>
    <Route path="/student/session/:sessionId" element={<StudentSessionPlaceholder/>}/>
  </Routes></MemoryRouter>);
  return fetcher;
}

it.each([false,true])('moves with the existing authenticated API and refreshes membership and state (source leader: %s)', async leader => {
  const fetcher = show({leader});
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'更換組別'}));
  await user.selectOptions(screen.getByLabelText('新組別'), destination.teamId);
  expect(screen.queryByLabelText('接任原組組長的組員')).toBeNull();
  await user.click(screen.getByRole('button', {name:'確認更換'}));
  expect(await screen.findByText('已更換至「新組」。')).toBeTruthy();
  expect(await screen.findByText(leader ? '一般組員（共同編輯）' : '組長（可提交）')).toBeTruthy();
  const index = fetcher.mock.calls.findIndex(([url]) => url.endsWith('/team-change'));
  const options = fetcher.mock.calls[index][1];
  expect(options).toMatchObject({method:'POST', credentials:'same-origin', headers:{'X-CSRF-Token':'csrf'}});
  expect(JSON.parse(String(options?.body))).toEqual({targetTeamId:destination.teamId});
  expect(fetcher.mock.calls.slice(index + 1).some(([url]) => url.endsWith('/me'))).toBe(true);
  expect(activity.refreshSnapshot).toHaveBeenCalledOnce();
});

it('hides team change on a later Waiting Round when the server disallows it', async () => {
  show({allowed:false});
  expect(await screen.findByText('等待老師開始')).toBeTruthy();
  expect(screen.queryByRole('button', {name:'更換組別'})).toBeNull();
});

it('lets a sole leader move without choosing a successor', async () => {
  const fetcher = show({leader:true});
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'更換組別'}));
  await user.selectOptions(screen.getByLabelText('新組別'), destination.teamId);
  expect(screen.getByText(/原組的組長由系統自動安排/)).toBeTruthy();
  expect(screen.queryByLabelText('接任原組組長的組員')).toBeNull();
  await user.click(screen.getByRole('button', {name:'確認更換'}));
  expect(await screen.findByText('已更換至「新組」。')).toBeTruthy();
  const post = fetcher.mock.calls.find(([url]) => url.endsWith('/team-change'));
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({targetTeamId:destination.teamId});
});

it('reports a server-side phase race without claiming the team was changed', async () => {
  show({reject:true});
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', {name:'更換組別'}));
  await user.selectOptions(screen.getByLabelText('新組別'), destination.teamId);
  await user.click(screen.getByRole('button', {name:'確認更換'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('活動已開始，無法更換組別。');
  expect(screen.getByText('原組')).toBeTruthy();
  expect(screen.queryByText('已更換至「新組」。')).toBeNull();
});
