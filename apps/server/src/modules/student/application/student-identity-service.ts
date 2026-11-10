import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type { ActorContext } from '@quiz/contracts/identity';
import { parseUUID, type UUID } from '@quiz/contracts/domain';
import type { createStudentRepositories } from '../persistence/index.js';

export const STUDENT_SESSION_COOKIE = 'student_session';
const cookie = createRequire(import.meta.url)('cookie') as {
  parse(header: string): Record<string, string>;
  serialize(name: string, value: string, options: { path: string; httpOnly: boolean; sameSite: 'lax'; secure: boolean; maxAge: number }): string;
};
const STUDENT_READ_PERMISSIONS = ['session:read', 'session:watch', 'target:read', 'results:read'] as const;

export function hashStudentSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface StudentResolvedIdentity {
  readonly credentialId: string;
  readonly actorContext: ActorContext;
}

export class StudentIdentityService {
  constructor(
    private readonly repositories: ReturnType<typeof createStudentRepositories>,
    private readonly options: { now?: () => string } = {},
  ) {}

  createOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  resolve(cookieHeader: string | undefined, requestedSessionId: string): StudentResolvedIdentity | null {
    const sessionId = parseUUID(requestedSessionId);
    const token = readStudentCookie(cookieHeader);
    if (!sessionId || !token) return null;
    const credential = this.repositories.credentials.findByTokenHash(hashStudentSessionToken(token));
    const now = (this.options.now ?? (() => new Date().toISOString()))();
    if (!credential || credential.revokedAt !== null || credential.expiresAt <= now) return null;
    const mapping = this.repositories.browserParticipants.findForSession(credential.id, sessionId);
    if (!mapping) return null;
    const boundedThreshold = new Date(Date.parse(now) - 5 * 60_000).toISOString();
    this.repositories.credentials.touchLastSeenIfOlder(credential.id, boundedThreshold, now);
    return {
      credentialId: credential.id,
      actorContext: {
        actorKind: 'participant',
        actorId: mapping.participantId,
        sessionId: mapping.sessionId,
        teamId: mapping.teamId,
        permissions: STUDENT_READ_PERMISSIONS,
      },
    };
  }
}

export function readStudentCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  try {
    const occurrences = cookieHeader.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${STUDENT_SESSION_COOKIE}=`));
    if (occurrences.length !== 1) return null;
    const token = cookie.parse(cookieHeader)[STUDENT_SESSION_COOKIE];
    if (!token || token.length < 40 || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
    return token;
  } catch {
    return null;
  }
}

export function serializeStudentSessionCookie(token: string, options: { nodeEnv: 'development' | 'test' | 'production'; isHttps: boolean; maxAgeSeconds: number }): string {
  if (!/^[A-Za-z0-9_-]{40,256}$/.test(token)) throw new Error('Student session token is invalid.');
  if (options.nodeEnv === 'production' && !options.isHttps) throw new Error('Student session cookies require HTTPS in production.');
  return cookie.serialize(STUDENT_SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: options.isHttps,
    maxAge: options.maxAgeSeconds,
  });
}

export function isStudentSessionId(value: unknown): value is UUID {
  return parseUUID(value) !== null;
}
