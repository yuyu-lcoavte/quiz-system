import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly sqlitePath: string;
  readonly activityCodeLookupMaxRequests: number;
  readonly activityCodeLookupWindowMs: number;
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

  return { nodeEnv, port, sqlitePath, activityCodeLookupMaxRequests, activityCodeLookupWindowMs };
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string, maximum: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  return value;
}
