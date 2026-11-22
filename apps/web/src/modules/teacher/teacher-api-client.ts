import type {
  ActivitySummary,
  ImportPreviewView,
  TeacherMeView,
  TeacherMonitorView,
  TeacherResultView,
  TeacherSessionView,
} from '@quiz/contracts';
import type { RoundTargetReference, SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import { teacherErrorMessage } from './error-messages.js';

const BASE = '/api/v1/teacher';

export class TeacherApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'TeacherApiError';
  }
}

/** 409 means the page should reload the latest state (research.md R9, FR-020). */
export function isConflict(error: unknown): error is TeacherApiError {
  return error instanceof TeacherApiError && error.status === 409 && (error.code === 'STALE_STATE' || error.code === 'INVALID_PHASE');
}

export function displayError(error: unknown): string {
  return error instanceof TeacherApiError ? error.message : teacherErrorMessage(undefined);
}

export interface TeacherApiClientOptions {
  /** Called on any 401 except a failed login; pages redirect to /teacher/login. */
  readonly onUnauthenticated?: () => void;
}

/** Same-origin Teacher API client: cookie credentials, X-CSRF-Token from /me on every mutation. */
export function createTeacherApiClient(options: TeacherApiClientOptions = {}) {
  let csrfToken: string | null = null;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      if (path !== '/auth/login') headers['X-CSRF-Token'] = csrfToken ?? (await me()).csrfToken;
    }
    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await fetch(`${BASE}${path}`, {
        method, credentials: 'same-origin', headers, ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new TeacherApiError(0, 'NETWORK', '無法連線到伺服器，請確認網路後再試。');
    }
    if (response.ok) return (response.status === 204 ? undefined : ((await response.json()) as { data: T }).data) as T;
    let payload: { error?: { code?: string; details?: Record<string, unknown> } } = {};
    try { payload = (await response.json()) as typeof payload; } catch { /* non-JSON error body */ }
    const code = payload.error?.code ?? 'INTERNAL_ERROR';
    if (response.status === 401 && path !== '/auth/login') {
      csrfToken = null;
      options.onUnauthenticated?.();
    }
    throw new TeacherApiError(response.status, code, teacherErrorMessage(code, payload.error?.details), payload.error?.details);
  }

  async function me(): Promise<TeacherMeView> {
    const view = await call<TeacherMeView>('GET', '/me');
    csrfToken = view.csrfToken;
    return view;
  }

  const sessionPath = (sessionId: UUID) => `/sessions/${sessionId}`;

  return {
    me,
    login: async (password: string) => { csrfToken = null; await call<void>('POST', '/auth/login', { password }); },
    logout: async () => { await call<void>('POST', '/auth/logout'); csrfToken = null; },
    listSessions: () => call<ActivitySummary[]>('GET', '/sessions'),
    createSession: (teamCount: number) => call<ActivitySummary>('POST', '/sessions', { teamCount }),
    getSession: (sessionId: UUID) => call<TeacherSessionView>('GET', sessionPath(sessionId)),
    selectTarget: (sessionId: UUID, target: RoundTargetReference, expectedStateVersion: number) =>
      call<SessionStateSnapshot>('POST', `${sessionPath(sessionId)}/rounds/select`, { target, expectedStateVersion }),
    next: (sessionId: UUID, expectedStateVersion: number) =>
      call<SessionStateSnapshot>('POST', `${sessionPath(sessionId)}/rounds/next`, { expectedStateVersion }),
    start: (sessionId: UUID, expectedStateVersion: number) =>
      call<SessionStateSnapshot>('POST', `${sessionPath(sessionId)}/rounds/start`, { expectedStateVersion }),
    end: (sessionId: UUID, expectedStateVersion: number) =>
      call<SessionStateSnapshot>('POST', `${sessionPath(sessionId)}/rounds/end`, { expectedStateVersion }),
    importPreview: (sessionId: UUID, url: string) =>
      call<ImportPreviewView>('POST', `${sessionPath(sessionId)}/import/preview`, { url }),
    importConfirm: (sessionId: UUID, url: string, previewDigest: string) =>
      call<TeacherSessionView>('POST', `${sessionPath(sessionId)}/import/confirm`, { url, previewDigest }),
    monitor: (sessionId: UUID) => call<TeacherMonitorView>('GET', `${sessionPath(sessionId)}/monitor`),
    results: (sessionId: UUID, roundId?: UUID) =>
      call<TeacherResultView>('GET', `${sessionPath(sessionId)}/results${roundId ? `?roundId=${roundId}` : ''}`),
  };
}

export type TeacherApiClient = ReturnType<typeof createTeacherApiClient>;
