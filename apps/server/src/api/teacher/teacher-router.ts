import { Router } from 'express';
import type { TeacherServiceDependencies } from '../../app.js';
import type { TeacherConfig } from '../../modules/teacher/config.js';
import type { TeacherRepositories } from '../../modules/teacher/persistence/index.js';

/** Everything the Teacher routes need; built once per server by `createTeacherIntegration`. */
export interface TeacherRouterContext {
  readonly config: TeacherConfig;
  readonly services: TeacherServiceDependencies;
  readonly repositories: TeacherRepositories;
  readonly now: () => Date;
}

/**
 * Mounted by the shared API router at `/api/v1/teacher`.
 * Teacher identity is established only inside this router (see student-teacher-decisions.md section 5).
 * Unknown paths fall through to the shared 404 / error handlers.
 */
export function createTeacherRouter(_context: TeacherRouterContext): Router {
  const router = Router();
  return router;
}
