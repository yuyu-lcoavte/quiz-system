import type { TeacherIntegrationOptions } from '../../app.js';
import { createTeacherRouter } from '../../api/teacher/teacher-router.js';
import { TeacherLoginSessionService } from './auth/login-session-service.js';
import { createTeacherSocketIdentity, type TeacherSocketIdentity } from './auth/teacher-socket-identity.js';
import type { TeacherConfig } from './config.js';
import { createTeacherRepositories } from './persistence/index.js';
import type { SheetsGateway } from './sheets/sheets-gateway.js';

/** Replaced in the Google gateway step; until then Sheets stays unconfigured. */
function createConfiguredSheetsGateway(_config: TeacherConfig): SheetsGateway | null {
  return null;
}

export interface TeacherIntegrationOverrides {
  /** Injectable clock for tests. */
  readonly now?: () => Date;
  /** Injected gateway (tests use the in-memory fake); null = Sheets not configured. Omitted = built from config. */
  readonly sheetsGateway?: SheetsGateway | null;
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
  const sheetsGateway = overrides.sheetsGateway !== undefined ? overrides.sheetsGateway : createConfiguredSheetsGateway(config);

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
      return createTeacherRouter({ config, services, repositories, now, loginSessions, sheetsGateway });
    },
    resolveSocketActorContext: (socket) => socketIdentity?.resolveSocketActorContext(socket) ?? null,
    authorizeWatch: (actor, sessionId) => socketIdentity?.authorizeWatch(actor, sessionId) ?? false,
  };
}
