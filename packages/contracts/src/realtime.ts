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

export function parseSessionStateSnapshot(value: unknown): SessionStateSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const sessionId = parseUUID(data.sessionId);
  if (!sessionId || !Number.isSafeInteger(data.stateVersion) || (data.stateVersion as number) < 0 || typeof data.changedAt !== 'string' || Number.isNaN(Date.parse(data.changedAt))) return null;
  const target = data.target;
  const currentRoundId = data.currentRoundId === null ? null : parseUUID(data.currentRoundId);
  if (data.currentRoundId !== null && !currentRoundId) return null;
  if (data.phase !== 'Waiting' && data.phase !== 'Active' && data.phase !== 'Ended') return null;
  if (currentRoundId === null) {
    if (data.phase !== 'Waiting' || target !== null) return null;
    return { sessionId, phase: 'Waiting', currentRoundId: null, target: null, stateVersion: data.stateVersion as number, changedAt: data.changedAt };
  }
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return null;
  const targetData = target as Record<string, unknown>;
  if (targetData.kind === 'question' && Object.keys(targetData).length === 2) {
    const questionId = parseUUID(targetData.questionId);
    if (questionId) return { sessionId, phase: data.phase as 'Waiting' | 'Active' | 'Ended', currentRoundId, target: { kind: 'question', questionId }, stateVersion: data.stateVersion as number, changedAt: data.changedAt };
  }
  if (targetData.kind === 'questionGroup' && Object.keys(targetData).length === 2) {
    const questionGroupId = parseUUID(targetData.questionGroupId);
    if (questionGroupId) return { sessionId, phase: data.phase as 'Waiting' | 'Active' | 'Ended', currentRoundId, target: { kind: 'questionGroup', questionGroupId }, stateVersion: data.stateVersion as number, changedAt: data.changedAt };
  }
  return null;
}
