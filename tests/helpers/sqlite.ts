import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { runMigrations } from '../../apps/server/src/persistence/migrate.js';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { registerTestCleanup } from '../setup.js';

export interface TestDatabase {
  readonly database: Database.Database;
  readonly directory: string;
  readonly path: string;
  runMigrations(migrationsDirectory: string): string[];
  cleanup(): void;
}

export function createTestDatabase(): TestDatabase {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Temporary test databases are only available when NODE_ENV=test.');
  }

  const directory = mkdtempSync(join(tmpdir(), 'quiz-foundation-test-'));
  const path = join(directory, 'isolated.sqlite');
  const manager = new DatabaseManager({ sqlitePath: path });
  const database = manager.open();
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    manager.close();
    rmSync(directory, { recursive: true, force: true });
  };

  registerTestCleanup(cleanup);

  return {
    database,
    directory,
    path,
    runMigrations: (migrationsDirectory) => runMigrations(database, migrationsDirectory),
    cleanup,
  };
}
