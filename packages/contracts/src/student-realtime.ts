import { parseUUID, type UUID } from './domain.js';
import type { ClientToServerEvents, ServerToClientEvents } from './realtime.js';

export interface StudentDraftWatchPayload {
  sessionId: UUID;
  roundId: UUID;
}

export interface StudentDraftAnswerView {
  blankId: UUID;
  value: string;
  revision: number;
}

export interface StudentDraftSnapshotPayload {
  sessionId: UUID;
  roundId: UUID;
  version: number;
  status: 'editable' | 'locked';
  answers: StudentDraftAnswerView[];
}

export interface StudentDraftEditPayload extends StudentDraftWatchPayload {
  blankId: UUID;
  value: string;
  baseVersion: number;
  clientMutationId: UUID;
  csrfToken: string;
}

export interface StudentDraftChangedPayload extends StudentDraftWatchPayload {
  version: number;
  answer: StudentDraftAnswerView;
  clientMutationId: UUID;
}

export interface StudentDraftLockedPayload extends StudentDraftWatchPayload {
  version: number;
  status: 'locked';
}

export interface StudentDraftErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}

export interface StudentDraftClientToServerEvents {
  'student:draft:watch': (payload: StudentDraftWatchPayload) => void;
  'student:draft:edit': (payload: StudentDraftEditPayload) => void;
}

export interface StudentDraftServerToClientEvents {
  'student:draft:snapshot': (payload: StudentDraftSnapshotPayload) => void;
  'student:draft:changed': (payload: StudentDraftChangedPayload) => void;
  'student:draft:locked': (payload: StudentDraftLockedPayload) => void;
  'student:draft:error': (payload: StudentDraftErrorPayload) => void;
}

export type StudentClientToServerEvents = ClientToServerEvents & StudentDraftClientToServerEvents;
export type StudentServerToClientEvents = ServerToClientEvents & StudentDraftServerToClientEvents;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function parseDraftScope(value: Record<string, unknown>): { sessionId: UUID; roundId: UUID } | null {
  const sessionId = parseUUID(value.sessionId);
  const roundId = parseUUID(value.roundId);
  return sessionId && roundId ? { sessionId, roundId } : null;
}

function parseAnswer(value: unknown): StudentDraftAnswerView | null {
  if (!isRecord(value) || !hasExactKeys(value, ['blankId', 'value', 'revision'])) return null;
  const blankId = parseUUID(value.blankId);
  if (!blankId || typeof value.value !== 'string' || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1) return null;
  return { blankId, value: value.value, revision: value.revision as number };
}

export function parseStudentDraftWatchPayload(value: unknown): StudentDraftWatchPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sessionId', 'roundId'])) return null;
  return parseDraftScope(value);
}

export function parseStudentDraftEditPayload(value: unknown): StudentDraftEditPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sessionId', 'roundId', 'blankId', 'value', 'baseVersion', 'clientMutationId', 'csrfToken'])) return null;
  const scope = parseDraftScope(value);
  const blankId = parseUUID(value.blankId);
  const clientMutationId = parseUUID(value.clientMutationId);
  if (!scope || !blankId || !clientMutationId || typeof value.value !== 'string') return null;
  if (!Number.isSafeInteger(value.baseVersion) || (value.baseVersion as number) < 0 || typeof value.csrfToken !== 'string' || !value.csrfToken) return null;
  return { ...scope, blankId, value: value.value, baseVersion: value.baseVersion as number, clientMutationId, csrfToken: value.csrfToken };
}

export function parseStudentDraftSnapshotPayload(value: unknown): StudentDraftSnapshotPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sessionId', 'roundId', 'version', 'status', 'answers'])) return null;
  const scope = parseDraftScope(value);
  if (!scope || !Number.isSafeInteger(value.version) || (value.version as number) < 0) return null;
  if (value.status !== 'editable' && value.status !== 'locked') return null;
  if (!Array.isArray(value.answers)) return null;
  const answers = value.answers.map(parseAnswer);
  if (answers.some((answer) => answer === null)) return null;
  return { ...scope, version: value.version as number, status: value.status, answers: answers as StudentDraftAnswerView[] };
}

export function parseStudentDraftChangedPayload(value: unknown): StudentDraftChangedPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sessionId', 'roundId', 'version', 'answer', 'clientMutationId'])) return null;
  const scope = parseDraftScope(value);
  const answer = parseAnswer(value.answer);
  const clientMutationId = parseUUID(value.clientMutationId);
  if (!scope || !answer || !clientMutationId || !Number.isSafeInteger(value.version) || (value.version as number) < 1) return null;
  return { ...scope, version: value.version as number, answer, clientMutationId };
}

export function parseStudentDraftLockedPayload(value: unknown): StudentDraftLockedPayload | null {
  if (!isRecord(value) || !hasExactKeys(value, ['sessionId', 'roundId', 'version', 'status'])) return null;
  const scope = parseDraftScope(value);
  if (!scope || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || value.status !== 'locked') return null;
  return { ...scope, version: value.version as number, status: 'locked' };
}

export function parseStudentDraftErrorPayload(value: unknown): StudentDraftErrorPayload | null {
  if (!isRecord(value) || !(hasExactKeys(value, ['code', 'message']) || hasExactKeys(value, ['code', 'message', 'requestId']))) return null;
  if (typeof value.code !== 'string' || typeof value.message !== 'string') return null;
  if (value.requestId !== undefined && typeof value.requestId !== 'string') return null;
  return { code: value.code, message: value.message, ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}) };
}
