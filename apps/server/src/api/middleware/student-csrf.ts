import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { parseUUID, type UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../errors/http-error.js';

interface StudentCsrfScope { credentialId: string; sessionId: UUID; }
interface StudentCsrfPayload extends StudentCsrfScope { expiresAt: number; nonce: string; }

export interface StudentCsrfService {
  issue(scope: StudentCsrfScope): string;
  verify(token: string | undefined, scope: StudentCsrfScope): boolean;
}

export function verifyStudentSocketMutationCsrf(
  service: StudentCsrfService,
  token: string | undefined,
  identity: { readonly credentialId: string; readonly actorContext: { readonly actorKind: string; readonly sessionId?: UUID } },
  requestedSessionId: UUID,
): boolean {
  return identity.actorContext.actorKind === 'participant' &&
    identity.actorContext.sessionId === requestedSessionId &&
    service.verify(token, { credentialId: identity.credentialId, sessionId: requestedSessionId });
}

export function createStudentCsrfService(options: { secret: string; ttlMs?: number; now?: () => number }): StudentCsrfService {
  const secret = Buffer.from(options.secret, 'utf8');
  if (secret.length < 32) throw new Error('STUDENT_CSRF_SECRET must contain at least 32 random bytes.');
  const ttlMs = options.ttlMs ?? 15 * 60_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 24 * 60 * 60_000) throw new Error('Student CSRF token lifetime is invalid.');
  const now = options.now ?? Date.now;
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

  return {
    issue(scope) {
      const payload: StudentCsrfPayload = {
        credentialId: scope.credentialId,
        sessionId: scope.sessionId,
        expiresAt: now() + ttlMs,
        nonce: randomBytes(24).toString('base64url'),
      };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${encoded}.${sign(encoded)}`;
    },
    verify(token, scope) {
      if (!token || token.length > 2048) return false;
      const parts = token.split('.');
      if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false;
      const expected = Buffer.from(sign(parts[0]));
      const actual = Buffer.from(parts[1]);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
      try {
        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<StudentCsrfPayload>;
        return payload.credentialId === scope.credentialId &&
          payload.sessionId === scope.sessionId &&
          parseUUID(payload.sessionId) !== null &&
          Number.isSafeInteger(payload.expiresAt) &&
          (payload.expiresAt as number) > now() &&
          typeof payload.nonce === 'string' && payload.nonce.length > 0;
      } catch {
        return false;
      }
    },
  };
}

export function createStudentCsrfMiddleware(service: StudentCsrfService): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const credentialId = request.studentCredentialId;
    const sessionId = parseUUID(request.params.sessionId);
    const token = request.get('X-CSRF-Token');
    if (!credentialId || !sessionId || !service.verify(token, { credentialId, sessionId })) {
      next(new HttpError(403, 'FORBIDDEN', 'A valid Student CSRF token is required.'));
      return;
    }
    next();
  };
}

export function setStudentCsrfNoStore(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
}
