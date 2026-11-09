import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router.js';
import { RouterProvider } from 'react-router-dom';

function renderRoute(path: string) {
  return render(<RouterProvider router={createAppRouter([path])} />);
}

describe('shared application routes', () => {
  it('renders the shared homepage and role entry links', () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { name: '課堂搶答系統' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /老師入口/ }).getAttribute('href')).toBe('/teacher/login');
    expect(screen.getByRole('link', { name: /學生入口/ }).getAttribute('href')).toBe('/student/join');
  });

  it('navigates from the shared homepage to a role placeholder', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await user.click(screen.getByRole('link', { name: '進入老師端' }));
    expect(screen.getByRole('heading', { name: '老師登入入口' })).toBeTruthy();
  });

  it.each([
    ['/teacher/login', '老師登入入口'],
    ['/teacher/dashboard', '老師管理入口'],
    ['/student/join', '學生加入活動'],
    ['/student/session/session-demo', '學生活動頁面'],
  ])('loads the approved route %s', (path, heading) => {
    renderRoute(path);
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
  });

  it('recognizes the sessionId route parameter', () => {
    renderRoute('/student/session/session-demo-42');
    expect(screen.getByText('session-demo-42')).toBeTruthy();
  });
});
