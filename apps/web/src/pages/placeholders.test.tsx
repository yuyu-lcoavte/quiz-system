import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '../app/router.js';

describe('role placeholder pages', () => {
  it.each([
    ['/teacher/login', '老師登入入口', '老師端'],
    ['/teacher/dashboard', '老師管理入口', '老師端'],
    ['/student/join', '學生加入活動', '學生端'],
    ['/student/session/demo-session', '學生活動頁面', '學生端'],
  ])('identifies the module and links home from %s', (path, heading, moduleName) => {
    render(<RouterProvider router={createAppRouter([path])} />);

    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByText(new RegExp(`目前模組：${moduleName}`))).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回首頁' }).getAttribute('href')).toBe('/');
  });
});
