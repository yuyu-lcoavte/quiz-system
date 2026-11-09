import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/sqlite.js';

const migrationDirectories: string[] = [];

afterEach(() => {
  for (const directory of migrationDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Phase 2 migration infrastructure', () => {
  it('provides isolated temporary databases with foreign keys enabled', () => {
    const first = createTestDatabase();
    const second = createTestDatabase();

    expect(first.path).not.toBe(second.path);
    expect(first.database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(second.database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() => second.database.prepare('SELECT * FROM test_only_table').all()).toThrow();
  });

  it('runs ordered SQL migrations once and records their versions', () => {
    const testDatabase = createTestDatabase();
    const directory = mkdtempSync(join(tmpdir(), 'quiz-migrations-'));
    migrationDirectories.push(directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, '002-second.sql'), 'CREATE TABLE second_table (id TEXT);');
    writeFileSync(join(directory, '001-first.sql'), 'CREATE TABLE first_table (id TEXT);');

    expect(testDatabase.runMigrations(directory)).toEqual(['001-first.sql', '002-second.sql']);
    expect(testDatabase.runMigrations(directory)).toEqual([]);
    expect(
      testDatabase.database
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all(),
    ).toEqual([{ version: '001-first.sql' }, { version: '002-second.sql' }]);
  });

  it('rolls back a failed migration and does not mark it applied', () => {
    const testDatabase = createTestDatabase();
    const directory = mkdtempSync(join(tmpdir(), 'quiz-migrations-fail-'));
    migrationDirectories.push(directory);
    writeFileSync(
      join(directory, '001-failing.sql'),
      'CREATE TABLE rolled_back (id TEXT); THIS IS NOT SQL;',
    );

    expect(() => testDatabase.runMigrations(directory)).toThrow();
    expect(
      testDatabase.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back'")
        .get(),
    ).toBeUndefined();
    expect(
      testDatabase.database
        .prepare('SELECT version FROM schema_migrations WHERE version = ?')
        .get('001-failing.sql'),
    ).toBeUndefined();
  });
});
