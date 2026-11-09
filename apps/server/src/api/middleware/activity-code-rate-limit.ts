import type { RequestHandler } from 'express';
import { HttpError } from '../../errors/http-error.js';

export interface ActivityCodeRateLimitOptions { maxRequests: number; windowMs: number; }

/** Small in-process limiter for the anonymous lookup; production deployments may inject a shared store. */
export function createActivityCodeRateLimiter(options: ActivityCodeRateLimitOptions): RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (request, _response, next) => {
    const code = String(request.params.activityCode ?? '').trim().toUpperCase();
    const key = `${request.ip ?? request.socket.remoteAddress ?? 'unknown'}:${code}`;
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.maxRequests) {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many activity-code lookup requests.'));
      return;
    }
    next();
  };
}
