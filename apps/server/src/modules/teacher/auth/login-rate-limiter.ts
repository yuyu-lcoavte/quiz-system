/** research.md R4: 5 failures / 15 min per address, 50 failures / 15 min overall; in memory, single process. */
export interface LoginRateLimiterOptions {
  readonly now?: () => number;
  readonly perAddress?: number;
  readonly total?: number;
  readonly windowMs?: number;
}

export interface LoginRateLimiter {
  isBlocked(address: string): boolean;
  recordFailure(address: string): void;
  recordSuccess(address: string): void;
}

export function createLoginRateLimiter(options: LoginRateLimiterOptions = {}): LoginRateLimiter {
  const now = options.now ?? Date.now;
  const perAddress = options.perAddress ?? 5;
  const total = options.total ?? 50;
  const windowMs = options.windowMs ?? 15 * 60_000;
  const failures = new Map<string, number[]>();
  let allFailures: number[] = [];

  const recent = (times: number[]) => times.filter((time) => now() - time < windowMs);

  return {
    isBlocked(address) {
      allFailures = recent(allFailures);
      const mine = recent(failures.get(address) ?? []);
      if (mine.length === 0) failures.delete(address); else failures.set(address, mine);
      return mine.length >= perAddress || allFailures.length >= total;
    },
    recordFailure(address) {
      const time = now();
      failures.set(address, [...recent(failures.get(address) ?? []), time]);
      allFailures = [...recent(allFailures), time];
    },
    recordSuccess(address) {
      failures.delete(address);
    },
  };
}
