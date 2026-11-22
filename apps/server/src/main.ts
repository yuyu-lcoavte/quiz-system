import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './app.js';
import { defaultRepositoryRoot, parseTeacherConfig } from './modules/teacher/config.js';
import { createTeacherIntegration } from './modules/teacher/integration.js';

/**
 * Server entry with Teacher integration (specs/003-teacher-feature/research.md R2).
 * app.ts keeps its own entry block unchanged; this file is the `dev` entry.
 */

// Load the repository-root .env when present. Variables already set in the shell take precedence.
const envFile = join(defaultRepositoryRoot(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const teacherConfig = parseTeacherConfig();
if (!teacherConfig.configured) {
  console.warn('Teacher login is not configured (TEACHER_PASSWORD_HASH / TEACHER_SESSION_SECRET missing); Teacher login stays unavailable until both are set.');
}
console.info(`Teacher integration: login configured ${teacherConfig.configured}; Google Sheets configured ${teacherConfig.serviceAccountKeyFile !== null}`);

startServer(createTeacherIntegration(teacherConfig));
