import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTeacherApiClient, type TeacherApiClient } from './teacher-api-client.js';

/** Teacher API client whose 401 handler sends the browser to /teacher/login. */
export function useTeacherApi(): TeacherApiClient {
  const navigate = useNavigate();
  return useMemo(() => createTeacherApiClient({ onUnauthenticated: () => navigate('/teacher/login', { replace: true }) }), [navigate]);
}

export const PHASE_LABELS: Record<string, string> = {
  NotOpened: '未開放',
  Waiting: '等待中',
  Active: '搶答中',
  Ended: '已結束',
};

export const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButton = `${buttonClass} bg-indigo-700 text-white hover:bg-indigo-800`;
export const secondaryButton = `${buttonClass} border border-slate-300 text-slate-700 hover:bg-slate-50`;
