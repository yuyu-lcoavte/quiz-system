import { parseEnvironment } from './env.js';

export function getSqliteFilePath(): string {
  return parseEnvironment().sqlitePath;
}
