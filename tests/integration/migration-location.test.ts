import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveMigrationsDirectory } from '../../apps/server/src/persistence/migrate.js';

const repositoryRoot = resolve(process.cwd());
const expectedMigrations = resolve(repositoryRoot, 'apps/server/src/persistence/migrations');
const migrationModuleUrl = pathToFileURL(join(repositoryRoot, 'apps/server/src/persistence/migrate.ts')).href;

describe('migration directory resolution', () => {
  it.each([
    ['repository root', repositoryRoot],
    ['server workspace', join(repositoryRoot, 'apps/server')],
  ])('runs the real Migration Runner from the %s working directory', (_label, cwd) => {
    const script = [
      "import Database from 'better-sqlite3';",
      `import { runMigrations } from ${JSON.stringify(migrationModuleUrl)};`,
      "const database = new Database(':memory:');",
      'console.log(runMigrations(database).join(\',\'));',
      'database.close();',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', script], {
      cwd,
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('001-foundation.sql');
  });

  it('resolves source and compiled module layouts without depending on process.cwd()', () => {
    const sourcePath = resolveMigrationsDirectory(migrationModuleUrl);
    const compiledModuleUrl = pathToFileURL(join(repositoryRoot, 'apps/server/dist/persistence/migrate.js')).href;
    const compiledPath = resolveMigrationsDirectory(compiledModuleUrl);

    expect(sourcePath).toBe(expectedMigrations);
    expect(compiledPath).toBe(expectedMigrations);
  });
});
