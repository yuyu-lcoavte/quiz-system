import type { TeacherIntegrationOptions } from '../../app.js';
import { createTeacherRouter } from '../../api/teacher/teacher-router.js';
import type { TeacherConfig } from './config.js';
import { createTeacherRepositories } from './persistence/index.js';

export interface TeacherIntegrationOverrides {
  /** Injectable clock for tests. */
  readonly now?: () => Date;
}

/**
 * Teacher adapters for the reserved `startServer(teacherIntegration)` / `createHttpServer` seam in app.ts.
 * Deliberately does not supply the global `resolveActorContext`: Teacher identity exists only under /api/v1/teacher.
 */
export function createTeacherIntegration(config: TeacherConfig, overrides: TeacherIntegrationOverrides = {}): TeacherIntegrationOptions {
  const now = overrides.now ?? (() => new Date());
  return {
    createTeacherRouter: (services) => createTeacherRouter({
      config,
      services,
      repositories: createTeacherRepositories(services.database),
      now,
    }),
  };
}
