import { Router } from 'express';
import type { TeacherServiceDependencies } from '../../app.js';
import { HttpError } from '../../errors/http-error.js';
import { createLoginRateLimiter } from '../../modules/teacher/auth/login-rate-limiter.js';
import { TeacherLoginSessionService } from '../../modules/teacher/auth/login-session-service.js';
import { createTeacherCsrfService } from '../../modules/teacher/auth/teacher-csrf.js';
import type { TeacherConfig } from '../../modules/teacher/config.js';
import type { TeacherRepositories } from '../../modules/teacher/persistence/index.js';
import { ActivityService } from '../../modules/teacher/activity/activity-service.js';
import { RoundControlService } from '../../modules/teacher/rounds/round-control-service.js';
import { createTeacherActivityController } from './activity-controller.js';
import { createTeacherAuthController } from './auth-controller.js';
import { createTeacherRoundController } from './round-controller.js';
import { createTeacherMonitorController } from './monitor-controller.js';
import { TeacherResultProjection } from '../../modules/teacher/monitor/teacher-result-projection.js';
import { createLoginRateLimitMiddleware } from './middleware/login-rate-limit.js';
import { createTeacherAuthMiddleware } from './middleware/teacher-auth.js';
import { createTeacherCsrfMiddleware } from './middleware/teacher-csrf.js';
import { createTeacherOriginMiddleware } from './middleware/teacher-origin.js';
import { createTeacherSessionScopeMiddleware } from './middleware/session-scope.js';
import { createTeacherImportController } from './import-controller.js';
import { createTeacherWriteBackController } from './write-back-controller.js';
import { WriteBackService } from '../../modules/teacher/write-back/write-back-service.js';
import { GuidedNotesImportService } from '../../modules/teacher/guided-notes/import-service.js';
import type { SheetsGateway } from '../../modules/teacher/sheets/sheets-gateway.js';

/** Everything the Teacher routes need; built once per server by `createTeacherIntegration`. */
export interface TeacherRouterContext {
  readonly config: TeacherConfig;
  readonly services: TeacherServiceDependencies;
  readonly repositories: TeacherRepositories;
  readonly now: () => Date;
  /** Shared with the Socket identity so both verify the same login rows. */
  readonly loginSessions?: TeacherLoginSessionService;
  /** Google Sheets access; null when GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not configured. */
  readonly sheetsGateway: SheetsGateway | null;
}

/**
 * Mounted by the shared API router at `/api/v1/teacher`.
 * Teacher identity is established only inside this router (see student-teacher-decisions.md section 5).
 * Order: configured → Origin → login (rate limit) → cookie auth → CSRF → Session scope → feature routes.
 * Unknown paths fall through to the shared 404 / error handlers.
 */
export function createTeacherRouter(context: TeacherRouterContext): Router {
  const router = Router();
  const { config } = context;

  router.use((_request, _response, next) => {
    next(config.configured ? undefined : new HttpError(503, 'TEACHER_NOT_CONFIGURED', 'Teacher login is not configured on this server.'));
  });
  if (!config.configured) return router;

  const nowMs = () => context.now().getTime();
  const sessions = context.loginSessions
    ?? new TeacherLoginSessionService(context.repositories.loginSessions, config.sessionSecret!, context.now);
  const csrf = createTeacherCsrfService({ secret: config.sessionSecret!, now: nowMs });
  const limiter = createLoginRateLimiter({ now: nowMs });
  const auth = createTeacherAuthController({ config, sessions, csrf, limiter, serviceAccountEmail: () => context.sheetsGateway?.serviceAccountEmail() ?? null });

  router.use(createTeacherOriginMiddleware(config.allowedOrigins));
  router.post('/auth/login', createLoginRateLimitMiddleware(limiter), auth.login);

  router.use(createTeacherAuthMiddleware(sessions));
  router.use(createTeacherCsrfMiddleware(csrf));
  router.post('/auth/logout', auth.logout);
  router.get('/me', auth.me);

  const activityService = new ActivityService(context.services.database, context.repositories, context.now);
  const activities = createTeacherActivityController(activityService);
  const imports = createTeacherImportController(
    new GuidedNotesImportService(context.services.database, context.repositories, context.sheetsGateway, context.now),
    activityService,
  );
  const writeBack = createTeacherWriteBackController(
    new WriteBackService(context.services.database, context.repositories, context.sheetsGateway, context.now),
  );
  const rounds = createTeacherRoundController(new RoundControlService(context.services));
  const monitor = createTeacherMonitorController(new TeacherResultProjection(context.services.database));

  router.get('/sessions', activities.list);
  router.post('/sessions', activities.create);
  router.use('/sessions/:sessionId', createTeacherSessionScopeMiddleware(context.services.database));
  router.get('/sessions/:sessionId', activities.detail);
  router.post('/sessions/:sessionId/rounds/select', rounds.select);
  router.post('/sessions/:sessionId/rounds/next', rounds.next);
  router.post('/sessions/:sessionId/rounds/start', rounds.start);
  router.post('/sessions/:sessionId/rounds/end', rounds.end);
  router.get('/sessions/:sessionId/monitor', monitor.monitor);
  router.get('/sessions/:sessionId/results', monitor.results);
  router.post('/sessions/:sessionId/import/preview', imports.preview);
  router.post('/sessions/:sessionId/import/confirm', imports.confirm);
  router.post('/sessions/:sessionId/write-back/preview', writeBack.preview);
  router.post('/sessions/:sessionId/write-back/confirm', writeBack.confirm);

  return router;
}
