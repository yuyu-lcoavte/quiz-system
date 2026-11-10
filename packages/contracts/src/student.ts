import { parseUUID, type UUID } from './domain.js';
import type { ApiErrorEnvelope } from './errors.js';

/** Student API uses the same success/error envelope as Foundation. */
export type StudentApiErrorEnvelope = ApiErrorEnvelope;

export interface StudentEnrollmentRequest {
  /** Selection input only; the server verifies that the Team belongs to the Session. */
  teamId: UUID;
  displayName: string;
}

export interface StudentMembershipView {
  sessionId: UUID;
  participantId: UUID;
  team: { teamId: UUID; name: string };
  isLeader: boolean;
}

export interface StudentEnrollmentResponse extends StudentMembershipView {
  csrfToken: string;
}

export interface StudentCsrfTokenResponse {
  csrfToken: string;
  expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strict shape validation intentionally rejects client-supplied identity/role authority fields. */
export function parseStudentEnrollmentRequest(value: unknown): StudentEnrollmentRequest | null {
  if (!isRecord(value) || Object.keys(value).length !== 2) return null;
  const teamId = parseUUID(value.teamId);
  if (!teamId || typeof value.displayName !== 'string') return null;
  return { teamId, displayName: value.displayName };
}

export function parseStudentSessionScope(value: unknown): UUID | null {
  return parseUUID(value);
}
