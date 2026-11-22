import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTeacherConfig, TEACHER_DEFAULT_DEV_ORIGINS } from '../../apps/server/src/modules/teacher/config.js';

const repositoryRoot = resolve(process.cwd());
const outsideKey = resolve(repositoryRoot, '..', 'teacher-test-keys', 'service-account.json');
const secret = 's'.repeat(32);
const hash = 'scrypt$32768$8$1$c2FsdA$aGFzaA';

function parse(source: Record<string, string | undefined>) {
  return parseTeacherConfig(source, repositoryRoot);
}

describe('Teacher configuration', () => {
  it('parses a complete development configuration', () => {
    const config = parse({
      NODE_ENV: 'development',
      TEACHER_PASSWORD_HASH: hash,
      TEACHER_SESSION_SECRET: secret,
      TEACHER_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
      GOOGLE_SERVICE_ACCOUNT_KEY_FILE: outsideKey,
    });
    expect(config).toEqual({
      nodeEnv: 'development',
      passwordHash: hash,
      sessionSecret: secret,
      allowedOrigins: ['http://127.0.0.1:5173'],
      serviceAccountKeyFile: outsideKey,
      configured: true,
    });
  });

  it('uses the development origins by default outside production', () => {
    expect(TEACHER_DEFAULT_DEV_ORIGINS).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
    expect(parse({}).allowedOrigins).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
  });

  it('reports not configured in development when the hash or secret is missing', () => {
    expect(parse({}).configured).toBe(false);
    expect(parse({ TEACHER_PASSWORD_HASH: hash }).configured).toBe(false);
    expect(parse({ TEACHER_SESSION_SECRET: secret }).configured).toBe(false);
    expect(parse({ TEACHER_PASSWORD_HASH: '  ', TEACHER_SESSION_SECRET: '' }).configured).toBe(false);
  });

  it('requires the hash, secret and origins in production', () => {
    expect(() => parse({ NODE_ENV: 'production', TEACHER_SESSION_SECRET: secret, TEACHER_ALLOWED_ORIGINS: 'https://quiz.example' }))
      .toThrow(/TEACHER_PASSWORD_HASH/);
    expect(() => parse({ NODE_ENV: 'production', TEACHER_PASSWORD_HASH: hash, TEACHER_ALLOWED_ORIGINS: 'https://quiz.example' }))
      .toThrow(/TEACHER_SESSION_SECRET/);
    expect(() => parse({ NODE_ENV: 'production', TEACHER_PASSWORD_HASH: hash, TEACHER_SESSION_SECRET: secret }))
      .toThrow(/TEACHER_ALLOWED_ORIGINS/);
    expect(parse({ NODE_ENV: 'production', TEACHER_PASSWORD_HASH: hash, TEACHER_SESSION_SECRET: secret, TEACHER_ALLOWED_ORIGINS: 'https://quiz.example' }).configured)
      .toBe(true);
  });

  it('rejects a session secret shorter than 32 bytes', () => {
    expect(() => parse({ TEACHER_SESSION_SECRET: 's'.repeat(31) })).toThrow(/32/);
  });

  it('rejects a password hash that is not in the scrypt format', () => {
    expect(() => parse({ TEACHER_PASSWORD_HASH: 'plain-password' })).toThrow(/TEACHER_PASSWORD_HASH/);
    expect(() => parse({ TEACHER_PASSWORD_HASH: 'scrypt$1$2$3' })).toThrow(/TEACHER_PASSWORD_HASH/);
  });

  it('accepts only exact, unique HTTP(S) origins', () => {
    expect(parse({ TEACHER_ALLOWED_ORIGINS: 'http://localhost:5173, https://quiz.example' }).allowedOrigins)
      .toEqual(['http://localhost:5173', 'https://quiz.example']);
    for (const value of ['http://localhost:5173/', 'ftp://x.example', 'null', '', 'http://a.example,http://a.example', 'localhost:5173']) {
      expect(() => parse({ TEACHER_ALLOWED_ORIGINS: value })).toThrow(/TEACHER_ALLOWED_ORIGINS/);
    }
  });

  it('treats the service-account key file as optional', () => {
    expect(parse({}).serviceAccountKeyFile).toBeNull();
    expect(parse({ GOOGLE_SERVICE_ACCOUNT_KEY_FILE: '' }).serviceAccountKeyFile).toBeNull();
  });

  it('rejects a key file path inside the repository', () => {
    for (const inside of [
      join(repositoryRoot, 'service-account.json'),
      join(repositoryRoot, 'apps', 'server', 'key.json'),
      'secrets/key.json',
    ]) {
      expect(() => parse({ GOOGLE_SERVICE_ACCOUNT_KEY_FILE: inside })).toThrow(/outside the repository/);
    }
  });

  it('never includes secret values in error messages', () => {
    const shortSecret = 'unique-short-secret';
    let message = '';
    try { parse({ TEACHER_SESSION_SECRET: shortSecret }); } catch (error) { message = (error as Error).message; }
    expect(message).not.toContain(shortSecret);
  });
});
