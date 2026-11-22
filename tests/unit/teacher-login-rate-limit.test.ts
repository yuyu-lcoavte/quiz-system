import { describe, expect, it } from 'vitest';
import { createLoginRateLimiter } from '../../apps/server/src/modules/teacher/auth/login-rate-limiter.js';

const MINUTE = 60_000;

describe('Teacher login rate limiter', () => {
  it('blocks an address after 5 failures in 15 minutes', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({ now: () => now });
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.isBlocked('a')).toBe(false);
      limiter.recordFailure('a');
    }
    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
    now += 15 * MINUTE;
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('counts only failures inside the sliding 15-minute window', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({ now: () => now });
    for (let i = 0; i < 4; i += 1) limiter.recordFailure('a');
    now += 15 * MINUTE;
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('clears an address after a successful login', () => {
    const limiter = createLoginRateLimiter({ now: () => 0 });
    for (let i = 0; i < 4; i += 1) limiter.recordFailure('a');
    limiter.recordSuccess('a');
    for (let i = 0; i < 4; i += 1) limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('blocks everyone after 50 failures in 15 minutes from any addresses', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({ now: () => now });
    for (let i = 0; i < 50; i += 1) limiter.recordFailure(`address-${i}`);
    expect(limiter.isBlocked('fresh-address')).toBe(true);
    now += 15 * MINUTE;
    expect(limiter.isBlocked('fresh-address')).toBe(false);
  });
});
