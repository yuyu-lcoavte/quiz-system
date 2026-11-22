import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Format: scrypt$N$r$p$<saltBase64>$<hashBase64> (specs/003-teacher-feature/research.md R3). */
const N = 32768;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: MAX_MEMORY });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time comparison; any malformed or unsupported hash simply fails verification. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Bounded parameters: N is a power of two from 2^10 up to what this module produces (2^15), r/p fixed,
  // so a crafted hash cannot request huge memory/CPU. Lower N exists only for fast automated tests.
  if (!Number.isInteger(n) || n < 1024 || n > N || (n & (n - 1)) !== 0 || r !== R || p !== P) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = await derive(password, salt, expected.length, { N: n, r, p, maxmem: MAX_MEMORY });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
