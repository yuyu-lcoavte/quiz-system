import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../apps/server/src/modules/teacher/auth/password-hash.js';
import { parseTeacherConfig } from '../../apps/server/src/modules/teacher/config.js';

describe('Teacher password hash', () => {
  it('produces scrypt$N$r$p$salt$hash with N=32768, r=8, p=1, a 16-byte salt and a 64-byte key', async () => {
    const encoded = await hashPassword('correct horse');
    const [scheme, n, r, p, salt, key] = encoded.split('$');
    expect([scheme, n, r, p]).toEqual(['scrypt', '32768', '8', '1']);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
    expect(encoded).not.toContain('correct horse');
    // The config accepts what the generator produces.
    expect(parseTeacherConfig({ TEACHER_PASSWORD_HASH: encoded }).passwordHash).toBe(encoded);
  });

  it('uses a fresh salt each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const encoded = await hashPassword('correct horse');
    await expect(verifyPassword('correct horse', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong horse', encoded)).resolves.toBe(false);
    await expect(verifyPassword('', encoded)).resolves.toBe(false);
  });

  it('accepts lower power-of-two N down to 1024 but nothing above 32768 or with other r/p', async () => {
    const { scryptSync } = await import('node:crypto');
    const salt = Buffer.from('0123456789abcdef');
    const make = (n: number, r = 8, p = 1) =>
      `scrypt$${n}$${r}$${p}$${salt.toString('base64')}$${scryptSync('pw', salt, 64, { N: n, r, p, maxmem: 256 * 1024 * 1024 }).toString('base64')}`;
    await expect(verifyPassword('pw', make(1024))).resolves.toBe(true);
    await expect(verifyPassword('pw', make(65536))).resolves.toBe(false);
    await expect(verifyPassword('pw', make(512))).resolves.toBe(false);
    await expect(verifyPassword('pw', make(1024, 16))).resolves.toBe(false);
    await expect(verifyPassword('pw', make(1024, 8, 2))).resolves.toBe(false);
  });

  it('returns false for malformed hashes without throwing', async () => {
    for (const encoded of ['', 'plain', 'scrypt$1$2$3', 'bcrypt$32768$8$1$c2FsdA$aGFzaA', 'scrypt$32768$8$1$c2FsdA$', 'scrypt$9999999999$8$1$c2FsdA$aGFzaA']) {
      await expect(verifyPassword('anything', encoded)).resolves.toBe(false);
    }
  });
});
