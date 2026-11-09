import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const testCleanupCallbacks = new Set<() => void>();

export function registerTestCleanup(callback: () => void): void {
  testCleanupCallbacks.add(callback);
}

afterEach(() => {
  cleanup();
  for (const callback of [...testCleanupCallbacks]) {
    try {
      callback();
    } finally {
      testCleanupCallbacks.delete(callback);
    }
  }
});
