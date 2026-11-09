import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

/** Resolves migrations beside the source module, with a source-tree fallback for compiled dist output. */
export function resolveMigrationsDirectory(moduleUrl: string = import.meta.url): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    resolve(moduleDirectory, 'migrations'),
    resolve(moduleDirectory, '../../src/persistence/migrations'),
  ];
  const migrationsDirectory = candidates.find((candidate) => {
    try { return readdirSync(candidate).some((entry) => entry.toLowerCase().endsWith('.sql')); } catch { return false; }
  });
  if (!migrationsDirectory) {
    throw new Error(`Could not locate the Foundation migration directory relative to ${moduleUrl}.`);
  }
  return migrationsDirectory;
}

export function runMigrations(database: Database.Database, migrationsDirectory = resolveMigrationsDirectory()): string[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
  const isApplied = database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const recordApplied = database.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
  );
  const applied: string[] = [];

  for (const version of migrationFiles) {
    if (isApplied.get(version)) continue;
    const migrationSql = readFileSync(join(migrationsDirectory, version), 'utf8');
    const apply = database.transaction(() => {
      database.exec(migrationSql);
      recordApplied.run(version, new Date().toISOString());
    });
    apply();
    applied.push(version);
  }

  return applied;
}
