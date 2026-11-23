import { parseUUID, type ISODateTime, type RoundPhase, type RoundTargetReference, type SessionStateSnapshot, type UUID } from './domain.js';

/** Teacher API uses the shared success/error envelopes; see specs/003-teacher-feature/contracts/teacher-http-api.md. */

export const TEACHER_MAX_TEAMS = 20;
export const TEACHER_MAX_URL_LENGTH = 2048;
export const TEACHER_MAX_PASSWORD_LENGTH = 1024;

/** Stable codes the Teacher API may return in addition to the Foundation codes. */
export type TeacherApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'SESSION_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'INVALID_PHASE'
  | 'STALE_STATE'
  | 'NO_NEXT_TARGET'
  | 'NO_QUESTIONS'
  | 'TARGET_NOT_ANSWERABLE'
  | 'INVALID_SHEET_URL'
  | 'SHEET_NOT_SHARED'
  | 'SHEET_NOT_FOUND'
  | 'SHEET_FORMAT_INVALID'
  | 'DUPLICATE_QUESTION_NUMBER'
  | 'SHEETS_UNAVAILABLE'
  | 'SHEETS_NOT_CONFIGURED'
  | 'TEACHER_NOT_CONFIGURED'
  | 'IMPORT_LOCKED'
  | 'PREVIEW_CHANGED'
  | 'NOT_IMPORTED'
  | 'NOTHING_TO_WRITE'
  | 'SHEET_CONFLICT'
  | 'INTERNAL_ERROR';

export const TEACHER_API_ERROR_CODES: readonly TeacherApiErrorCode[] = [
  'UNAUTHENTICATED', 'FORBIDDEN', 'INVALID_CREDENTIALS', 'RATE_LIMITED', 'INVALID_INPUT', 'SESSION_NOT_FOUND',
  'TARGET_NOT_FOUND', 'INVALID_PHASE', 'STALE_STATE', 'NO_NEXT_TARGET', 'NO_QUESTIONS', 'TARGET_NOT_ANSWERABLE',
  'INVALID_SHEET_URL', 'SHEET_NOT_SHARED', 'SHEET_NOT_FOUND', 'SHEET_FORMAT_INVALID', 'DUPLICATE_QUESTION_NUMBER',
  'SHEETS_UNAVAILABLE', 'SHEETS_NOT_CONFIGURED', 'TEACHER_NOT_CONFIGURED', 'IMPORT_LOCKED', 'PREVIEW_CHANGED',
  'NOT_IMPORTED', 'NOTHING_TO_WRITE', 'SHEET_CONFLICT', 'INTERNAL_ERROR',
];

// ---------- Responses ----------

export interface TeacherMeView {
  authenticated: true;
  csrfToken: string;
  expiresAt: ISODateTime;
  serviceAccountEmail: string | null;
}

export interface ActivitySummary {
  sessionId: UUID;
  activityCode: string;
  createdAt: ISODateTime;
  teamCount: number;
  phase: RoundPhase;
  imported: boolean;
}

export type TargetStatus = 'NotOpened' | 'Waiting' | 'Active' | 'Ended';

export interface TargetStatusView {
  target: RoundTargetReference;
  number: string;
  kind: 'question' | 'questionGroup';
  questionCount: number;
  blankCount: number;
  status: TargetStatus;
  roundCount: number;
  hasResult: boolean;
}

export interface TeacherTeamView {
  teamId: UUID;
  name: string;
}

export interface TeacherSheetSourceView {
  spreadsheetUrl: string;
  sheetTitle: string;
  importedAt: ISODateTime;
}

export interface TeacherSessionView {
  sessionId: UUID;
  activityCode: string;
  state: SessionStateSnapshot;
  teams: TeacherTeamView[];
  targets: TargetStatusView[];
  source: TeacherSheetSourceView | null;
}

export interface TeacherAnswerView {
  blankId: UUID;
  label: string | null;
  value: string;
}

export interface TeacherMonitorTeamView {
  teamId: UUID;
  teamName: string;
  submitted: boolean;
  acceptedOrder: number | null;
  receivedAt: ISODateTime | null;
  answers: TeacherAnswerView[];
}

export interface TeacherMonitorView {
  roundId: UUID | null;
  phase: RoundPhase;
  teams: TeacherMonitorTeamView[];
}

export interface TeacherSubmissionView {
  teamId: UUID;
  teamName: string;
  acceptedOrder: number;
  receivedAt: ISODateTime;
  answers: TeacherAnswerView[];
}

export interface TeacherResultView {
  roundId: UUID;
  target: RoundTargetReference;
  number: string;
  roundNumber: number;
  submissions: TeacherSubmissionView[];
  winner: { teamId: UUID; teamName: string; answers: TeacherAnswerView[] } | null;
}

export interface ImportPreviewBlank {
  /** Cell the answer is written to (fill cell, or the marker cell). */
  cellA1: string;
  /** Marker label cell when the answer goes to a separate fill cell; null otherwise. */
  labelCellA1: string | null;
  marker: string | null;
  originalContent: string;
}

export interface ImportPreviewQuestion {
  row: number;
  blanks: ImportPreviewBlank[];
}

export interface ImportPreviewTarget {
  number: string;
  kind: 'question' | 'questionGroup';
  questions: ImportPreviewQuestion[];
}

export interface ImportPreviewView {
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  questionNumberCount: number;
  targets: ImportPreviewTarget[];
  warnings: string[];
  previewDigest: string;
}

export interface WriteBackEntryView {
  cellA1: string;
  currentContent: string;
  newContent: string;
  kind: 'write' | 'restore';
  number: string;
}

export interface WriteBackPlanView {
  entries: WriteBackEntryView[];
  planDigest: string;
}

export interface SheetConflictCell {
  cellA1: string;
  expected: string;
  actual: string | null;
}

// ---------- Requests (unknown fields are ignored; authority fields never come from the client) ----------

export interface TeacherLoginRequest { password: string }
export interface TeacherCreateSessionRequest { teamCount: number }
export interface TeacherExpectedVersionRequest { expectedStateVersion: number }
export interface TeacherSelectTargetRequest { target: RoundTargetReference; expectedStateVersion: number }
export interface TeacherImportPreviewRequest { url: string }
export interface TeacherImportConfirmRequest { url: string; previewDigest: string }
export interface TeacherWriteBackConfirmRequest { planDigest: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= TEACHER_MAX_URL_LENGTH;
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function parseTeacherLoginRequest(value: unknown): TeacherLoginRequest | null {
  if (!isRecord(value) || typeof value.password !== 'string') return null;
  if (value.password.length === 0 || value.password.length > TEACHER_MAX_PASSWORD_LENGTH) return null;
  return { password: value.password };
}

export function parseTeacherCreateSessionRequest(value: unknown): TeacherCreateSessionRequest | null {
  if (!isRecord(value)) return null;
  const { teamCount } = value;
  if (typeof teamCount !== 'number' || !Number.isInteger(teamCount) || teamCount < 1 || teamCount > TEACHER_MAX_TEAMS) return null;
  return { teamCount };
}

export function parseTeacherExpectedVersionRequest(value: unknown): TeacherExpectedVersionRequest | null {
  if (!isRecord(value) || !isVersion(value.expectedStateVersion)) return null;
  return { expectedStateVersion: value.expectedStateVersion };
}

export function parseTeacherSelectTargetRequest(value: unknown): TeacherSelectTargetRequest | null {
  if (!isRecord(value) || !isVersion(value.expectedStateVersion) || !isRecord(value.target)) return null;
  const target = value.target;
  if (target.kind === 'question') {
    const questionId = parseUUID(target.questionId);
    return questionId ? { target: { kind: 'question', questionId }, expectedStateVersion: value.expectedStateVersion } : null;
  }
  if (target.kind === 'questionGroup') {
    const questionGroupId = parseUUID(target.questionGroupId);
    return questionGroupId ? { target: { kind: 'questionGroup', questionGroupId }, expectedStateVersion: value.expectedStateVersion } : null;
  }
  return null;
}

export function parseTeacherImportPreviewRequest(value: unknown): TeacherImportPreviewRequest | null {
  if (!isRecord(value) || !isUrl(value.url)) return null;
  return { url: value.url };
}

export function parseTeacherImportConfirmRequest(value: unknown): TeacherImportConfirmRequest | null {
  if (!isRecord(value) || !isUrl(value.url) || !isDigest(value.previewDigest)) return null;
  return { url: value.url, previewDigest: value.previewDigest };
}

export function parseTeacherWriteBackConfirmRequest(value: unknown): TeacherWriteBackConfirmRequest | null {
  if (!isRecord(value) || !isDigest(value.planDigest)) return null;
  return { planDigest: value.planDigest };
}
