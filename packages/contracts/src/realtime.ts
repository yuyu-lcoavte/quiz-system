import { parseUUID, type SessionStateSnapshot, type UUID } from './domain.js';

export interface SessionWatchPayload {
  sessionId: UUID;
}

export interface SessionErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}

export interface ClientToServerEvents {
  'session:watch': (payload: SessionWatchPayload) => void;
}

export interface ServerToClientEvents {
  'session:state': (payload: SessionStateSnapshot) => void;
  'session:state:changed': (payload: SessionStateSnapshot) => void;
  'session:error': (payload: SessionErrorPayload) => void;
}

export function parseSessionWatchPayload(value: unknown): SessionWatchPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.sessionId !== 'string') return null;
  const sessionId = parseUUID(record.sessionId);
  return sessionId ? { sessionId } : null;
}
