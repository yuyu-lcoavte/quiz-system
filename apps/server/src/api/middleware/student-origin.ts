import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../../errors/http-error.js';

function normalizeOrigin(value: string): string | null {
  if (!value || value === 'null' || value.trim() !== value) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== value) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function assertStudentOrigin(origin: string | undefined, allowedOrigins: readonly string[]): void {
  const candidate = typeof origin === 'string' ? normalizeOrigin(origin) : null;
  const normalized = allowedOrigins.map(normalizeOrigin);
  if (allowedOrigins.length === 0 || normalized.some((item) => item === null)) {
    throw new Error('STUDENT_ALLOWED_ORIGINS must contain exact HTTP(S) origins.');
  }
  const allowlist = new Set(normalized as string[]);
  if (!candidate || !allowlist.has(candidate)) {
    throw new HttpError(403, 'FORBIDDEN', 'A trusted browser Origin is required.');
  }
}

export function createStudentOriginGuard(allowedOrigins: readonly string[]) {
  return (request: { readonly origin?: string }) => {
    assertStudentOrigin(request.origin, allowedOrigins);
  };
}

export function createStudentOriginMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const guard = createStudentOriginGuard(allowedOrigins);
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      guard({ origin: request.get('Origin') });
      next();
    } catch (error) {
      next(error);
    }
  };
}
