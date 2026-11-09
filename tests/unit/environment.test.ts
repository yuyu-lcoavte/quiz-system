import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../apps/server/src/config/env.js';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('environment configuration', () => {
  it('uses development defaults and resolves the SQLite file from the working directory', () => {
    const config = parseEnvironment({}, 'C:/quiz-system');

    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.sqlitePath).toBe(resolve('C:/quiz-system/data/quiz-system.sqlite'));
  });

  it('accepts an explicit port, environment and in-memory database path', () => {
    const config = parseEnvironment(
      { NODE_ENV: 'test', PORT: '4312', SQLITE_PATH: ':memory:' },
      'C:/quiz-system',
    );

    expect(config).toEqual({ nodeEnv: 'test', port: 4312, sqlitePath: ':memory:', activityCodeLookupMaxRequests: 30, activityCodeLookupWindowMs: 60_000 });
  });

  it('allows activity-code lookup rate limits to be configured', () => {
    const config = parseEnvironment({ ACTIVITY_CODE_LOOKUP_MAX_REQUESTS: '5', ACTIVITY_CODE_LOOKUP_WINDOW_MS: '12000' });
    expect(config.activityCodeLookupMaxRequests).toBe(5);
    expect(config.activityCodeLookupWindowMs).toBe(12_000);
  });

  it.each(['0', '-5', 'many', '3600001'])('rejects invalid activity-code rate limit %s', (value) => {
    expect(() => parseEnvironment({ ACTIVITY_CODE_LOOKUP_WINDOW_MS: value })).toThrow(/ACTIVITY_CODE_LOOKUP_WINDOW_MS/);
  });

  it.each(['0', '-1', '70000', 'not-a-port'])('rejects invalid PORT=%s', (port) => {
    expect(() => parseEnvironment({ PORT: port }, 'C:/quiz-system')).toThrow(/PORT/);
  });

  it('rejects unsupported NODE_ENV values', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'staging' }, 'C:/quiz-system')).toThrow(
      /NODE_ENV/,
    );
  });
});

describe('SQLite connection manager', () => {
  it('enables foreign keys on each connection and closes idempotently', () => {
    const firstDirectory = mkdtempSync(join(tmpdir(), 'quiz-db-'));
    const secondDirectory = mkdtempSync(join(tmpdir(), 'quiz-db-'));
    temporaryDirectories.push(firstDirectory, secondDirectory);

    const first = new DatabaseManager({ sqlitePath: join(firstDirectory, 'first.sqlite') });
    const second = new DatabaseManager({ sqlitePath: join(secondDirectory, 'second.sqlite') });
    const firstConnection = first.open();
    const secondConnection = second.open();

    expect(firstConnection.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(secondConnection.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(firstConnection).not.toBe(secondConnection);

    first.close();
    first.close();
    second.close();
  });

  it('does not share in-memory test databases', () => {
    const first = new Database(':memory:');
    const second = new Database(':memory:');
    first.pragma('foreign_keys = ON');
    second.pragma('foreign_keys = ON');
    first.exec('CREATE TABLE isolated_value (value TEXT)');

    expect(() => second.prepare('SELECT * FROM isolated_value').all()).toThrow();

    first.close();
    second.close();
  });
});
