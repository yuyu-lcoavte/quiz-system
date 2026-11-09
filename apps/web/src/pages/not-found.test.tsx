import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from '../app/router.js';

describe('unknown routes', () => {
  it('shows the common not-found page and a route home', () => {
    render(<RouterProvider router={createAppRouter(['/not/a/real/page'])} />);

    expect(screen.getByRole('heading', { name: '找不到此頁面' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回首頁' }).getAttribute('href')).toBe('/');
  });
});
