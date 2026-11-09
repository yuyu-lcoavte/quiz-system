import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

export function runMigrations(database: Database.Database, migrationsDirectory: string): string[] {
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
