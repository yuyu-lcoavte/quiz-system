import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout.js';
import { HomePage } from '../pages/HomePage.js';
import { NotFoundPage } from '../pages/NotFoundPage.js';
import { StudentJoinPlaceholder } from '../pages/StudentJoinPlaceholder.js';
import { StudentSessionPlaceholder } from '../pages/StudentSessionPlaceholder.js';
import { TeacherDashboardPlaceholder } from '../pages/TeacherDashboardPlaceholder.js';
import { TeacherLoginPlaceholder } from '../pages/TeacherLoginPlaceholder.js';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'teacher/login', element: <TeacherLoginPlaceholder /> },
      { path: 'teacher/dashboard', element: <TeacherDashboardPlaceholder /> },
      { path: 'student/join', element: <StudentJoinPlaceholder /> },
      { path: 'student/session/:sessionId', element: <StudentSessionPlaceholder /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** Memory-backed router for isolated route tests. */
export function createAppRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

export const browserRouter = createBrowserRouter(appRoutes);
