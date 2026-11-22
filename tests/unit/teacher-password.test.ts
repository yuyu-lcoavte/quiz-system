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

  it('returns false for malformed hashes without throwing', async () => {
    for (const encoded of ['', 'plain', 'scrypt$1$2$3', 'bcrypt$32768$8$1$c2FsdA$aGFzaA', 'scrypt$32768$8$1$c2FsdA$', 'scrypt$9999999999$8$1$c2FsdA$aGFzaA']) {
      await expect(verifyPassword('anything', encoded)).resolves.toBe(false);
    }
  });
});
