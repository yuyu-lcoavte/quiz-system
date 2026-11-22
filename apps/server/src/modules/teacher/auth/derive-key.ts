import { createHmac } from 'node:crypto';

/** Separate HMAC keys per purpose from TEACHER_SESSION_SECRET, so a cookie signature can never pass as a CSRF token. */
export function deriveTeacherKey(secret: string, purpose: 'teacher-session-cookie' | 'teacher-csrf'): Buffer {
  return createHmac('sha256', secret).update(`quiz-system:${purpose}:v1`).digest();
}
