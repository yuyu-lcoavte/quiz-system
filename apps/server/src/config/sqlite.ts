import { resolve } from 'node:path';

export function getSqliteFilePath(): string {
  return resolve(process.env.SQLITE_PATH ?? './data/quiz-system.sqlite');
}
