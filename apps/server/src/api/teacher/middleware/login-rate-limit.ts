import type { Request, RequestHandler } from 'express';
import { HttpError } from '../../../errors/http-error.js';
import type { LoginRateLimiter } from '../../../modules/teacher/auth/login-rate-limiter.js';

export function loginAddress(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

/** Rejects login attempts while the address (or the whole server) is over the failure limit. */
export function createLoginRateLimitMiddleware(limiter: LoginRateLimiter): RequestHandler {
  return (request, _response, next) => {
    if (limiter.isBlocked(loginAddress(request))) {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many failed login attempts. Try again later.'));
      return;
    }
    next();
  };
}
