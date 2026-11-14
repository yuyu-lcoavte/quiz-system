import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly sqlitePath: string;
  readonly activityCodeLookupMaxRequests: number;
  readonly activityCodeLookupWindowMs: number;
  readonly studentAllowedOrigins: readonly string[];
  readonly studentCsrfSecret: string | null;
}

export function parseEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): RuntimeConfig {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const rawPort = source.PORT ?? '3000';
  if (!/^\d+$/.test(rawPort)) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const rawSqlitePath = source.SQLITE_PATH?.trim() || './data/quiz-system.sqlite';
  const sqlitePath = rawSqlitePath === ':memory:' ? rawSqlitePath : resolve(workingDirectory, rawSqlitePath);
  const activityCodeLookupMaxRequests = parsePositiveInteger(source.ACTIVITY_CODE_LOOKUP_MAX_REQUESTS, 30, 'ACTIVITY_CODE_LOOKUP_MAX_REQUESTS', 100_000);
  const activityCodeLookupWindowMs = parsePositiveInteger(source.ACTIVITY_CODE_LOOKUP_WINDOW_MS, 60_000, 'ACTIVITY_CODE_LOOKUP_WINDOW_MS', 3_600_000);
  const studentAllowedOrigins = parseStudentAllowedOrigins(source.STUDENT_ALLOWED_ORIGINS, nodeEnv);
  const studentCsrfSecret = source.STUDENT_CSRF_SECRET?.trim() || null;
  if (studentCsrfSecret !== null && Buffer.byteLength(studentCsrfSecret, 'utf8') < 32) {
    throw new Error('STUDENT_CSRF_SECRET must contain at least 32 random bytes.');
  }
  if (nodeEnv === 'production' && studentCsrfSecret === null) {
    throw new Error('STUDENT_CSRF_SECRET is required in production.');
  }

  return { nodeEnv, port, sqlitePath, activityCodeLookupMaxRequests, activityCodeLookupWindowMs, studentAllowedOrigins, studentCsrfSecret };
}

function parseStudentAllowedOrigins(raw: string | undefined, nodeEnv: NodeEnvironment): string[] {
  const values = raw === undefined
    ? (nodeEnv === 'production' ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173'])
    : raw.split(',').map((origin) => origin.trim());
  if (values.length === 0 || values.some((origin) => !origin || origin === 'null')) {
    throw new Error('STUDENT_ALLOWED_ORIGINS must contain exact HTTP(S) origins.');
  }
  for (const origin of values) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error('STUDENT_ALLOWED_ORIGINS must contain exact HTTP(S) origins.'); }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== origin) {
      throw new Error('STUDENT_ALLOWED_ORIGINS must contain exact HTTP(S) origins.');
    }
  }
  if (new Set(values).size !== values.length) throw new Error('STUDENT_ALLOWED_ORIGINS cannot contain duplicate entries.');
  return values;
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string, maximum: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  return value;
}
