import type { TeacherIntegrationOptions } from '../../app.js';
import { createTeacherRouter } from '../../api/teacher/teacher-router.js';
import { TeacherLoginSessionService } from './auth/login-session-service.js';
import { createTeacherSocketIdentity, type TeacherSocketIdentity } from './auth/teacher-socket-identity.js';
import type { TeacherConfig } from './config.js';
import { createTeacherRepositories } from './persistence/index.js';

export interface TeacherIntegrationOverrides {
  /** Injectable clock for tests. */
  readonly now?: () => Date;
}

/**
 * Teacher adapters for the reserved `startServer(teacherIntegration)` / `createHttpServer` seam in app.ts.
 * Deliberately does not supply the global `resolveActorContext`: Teacher identity exists only under /api/v1/teacher
 * and on the Teacher Socket path.
 *
 * The shared Database is only known when app.ts calls `createTeacherRouter(services)` (synchronously, before the server
 * accepts connections), so the Socket identity is created there; until then every Teacher Socket resolves to null.
 */
export function createTeacherIntegration(config: TeacherConfig, overrides: TeacherIntegrationOverrides = {}): TeacherIntegrationOptions {
  const now = overrides.now ?? (() => new Date());
  let socketIdentity: TeacherSocketIdentity | null = null;

  return {
    createTeacherRouter: (services) => {
      const repositories = createTeacherRepositories(services.database);
      const loginSessions = config.configured
        ? new TeacherLoginSessionService(repositories.loginSessions, config.sessionSecret!, now)
        : undefined;
      if (loginSessions) {
        socketIdentity = createTeacherSocketIdentity({
          database: services.database,
          allowedOrigins: config.allowedOrigins,
          verifyCookie: (value) => loginSessions.verify(value),
        });
      }
      return createTeacherRouter({ config, services, repositories, now, loginSessions });
    },
    resolveSocketActorContext: (socket) => socketIdentity?.resolveSocketActorContext(socket) ?? null,
    authorizeWatch: (actor, sessionId) => socketIdentity?.authorizeWatch(actor, sessionId) ?? false,
  };
}
