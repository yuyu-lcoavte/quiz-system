import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly sqlitePath: string;
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

  return { nodeEnv, port, sqlitePath };
}
