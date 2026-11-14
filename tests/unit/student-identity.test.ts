import { describe, expect, it } from 'vitest';
import { StudentIdentityService, hashStudentSessionToken, readStudentCookie, serializeStudentSessionCookie } from '../../apps/server/src/modules/student/application/student-identity-service.js';
import { createStudentRepositories } from '../../apps/server/src/modules/student/persistence/index.js';
import { createFoundationTestContext } from '../helpers/foundation.js';

describe('Student browser identity primitives', () => {
  it('creates high-entropy opaque values and stores a non-reversible digest representation', () => {
    const context = createFoundationTestContext();
    const identity = new StudentIdentityService(createStudentRepositories(context.database));
    const first = identity.createOpaqueToken();
    const second = identity.createOpaqueToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(second).not.toBe(first);
    expect(hashStudentSessionToken(first)).toHaveLength(64);
    expect(hashStudentSessionToken(first)).not.toContain(first);
  });

  it('sets Path=/, HttpOnly and SameSite=Lax; Secure is enabled for production HTTPS', () => {
    const token = 'a'.repeat(43);
    const local = serializeStudentSessionCookie(token, { nodeEnv: 'development', isHttps: false, maxAgeSeconds: 86_400 });
    const production = serializeStudentSessionCookie(token, { nodeEnv: 'production', isHttps: true, maxAgeSeconds: 86_400 });
    expect(() => serializeStudentSessionCookie(token, { nodeEnv: 'production', isHttps: false, maxAgeSeconds: 86_400 })).toThrow(/HTTPS/);
    expect(local).toContain('Path=/');
    expect(local).toContain('HttpOnly');
    expect(local).toContain('SameSite=Lax');
    expect(local).not.toContain('Secure');
    expect(production).toContain('Secure');
    expect(readStudentCookie(local)).toBe(token);
  });

  it('does not accept duplicate, malformed, or invalid-character Student cookies', () => {
    const token = 'a'.repeat(43);
    expect(readStudentCookie(`student_session=${token}; student_session=${token}`)).toBeNull();
    expect(readStudentCookie('student_session=bad%ZZ')).toBeNull();
    expect(readStudentCookie(`student_session=${token}; forged_session=${token}`)).toBe(token);
  });
});
