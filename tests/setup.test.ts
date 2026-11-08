import { describe, expect, it } from 'vitest';

describe('Vitest setup', () => {
  it('provides the configured browser-like test environment', () => {
    expect(document.body).toBeDefined();
  });
});
