import type { RequestHandler } from 'express';
import { HttpError } from '../../../errors/http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Exact Origin allowlist for every Teacher mutation, including login (research.md R4). */
export function isAllowedTeacherOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return typeof origin === 'string' && origin === origin.trim() && allowedOrigins.includes(origin);
}

export function createTeacherOriginMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method) || isAllowedTeacherOrigin(request.get('Origin'), allowedOrigins)) {
      next();
      return;
    }
    next(new HttpError(403, 'FORBIDDEN', 'A trusted browser Origin is required.'));
  };
}
