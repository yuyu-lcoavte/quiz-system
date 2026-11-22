import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvironment } from '../../../config/env.js';
import { DatabaseManager } from '../../../persistence/database.js';
import { runMigrations } from '../../../persistence/migrate.js';
import { defaultRepositoryRoot } from '../config.js';
import { seedDemoActivity } from '../dev/seed-demo.js';

/**
 * `npm run teacher:seed-demo` — DEVELOPMENT ONLY.
 * Uses the same .env and SQLITE_PATH as `npm run dev` (server workspace working directory).
 */
const envFile = join(defaultRepositoryRoot(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = parseEnvironment();
if (config.nodeEnv === 'production') {
  process.stderr.write('teacher:seed-demo refuses to run when NODE_ENV=production.\n');
  process.exit(1);
}

const manager = new DatabaseManager({ sqlitePath: config.sqlitePath });
const database = manager.open();
try {
  runMigrations(database);
  const { activityCode } = seedDemoActivity(database, { nodeEnv: config.nodeEnv });
  process.stdout.write(`Demo activity created. Activity code: ${activityCode}\n`);
  process.stdout.write('Teams: 第1組, 第2組. Questions: 1 and 2 are groups of two; 3 and 4 are single questions.\n');
  process.stdout.write(`Database: ${config.sqlitePath}\n`);
} finally {
  manager.close();
}
