import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router, type Router as ExpressRouter } from 'express';
import type Database from 'better-sqlite3';
import { createApiRouter, type ApiRouterOptions } from './api/router.js';
import { parseEnvironment } from './config/env.js';
import { errorHandler, notFoundHandler } from './errors/error-handler.js';
import { DatabaseManager } from './persistence/database.js';
import { runMigrations } from './persistence/migrate.js';
import { createSocketServer, type SocketServerOptions } from './realtime/socket-server.js';
import { SessionStateService } from './modules/sessions/application/session-state-service.js';
import { SessionLifecycleService } from './modules/sessions/application/session-lifecycle-service.js';
import { SessionStatePublisher } from './realtime/session-state-publisher.js';
import { createStudentRouter,type StudentSecurityOptions } from './api/student/student-router.js';
import { createStudentRepositories } from './modules/student/persistence/index.js';
import { StudentIdentityService } from './modules/student/application/student-identity-service.js';
import { DraftService } from './modules/student/application/draft-service.js';
import { createStudentCsrfService } from './api/middleware/student-csrf.js';
import { studentDraftRoomName } from './modules/student/realtime/student-draft-room.js';
import type { StudentEventSocket } from './modules/student/realtime/student-draft-socket.js';
import { publishStudentDraftLock } from './modules/student/realtime/student-draft-socket.js';
import { SubmissionService } from './modules/student/application/submission-service.js';
import { parseUUID, type UUID } from '@quiz/contracts/domain';
import { getStudentSocketIdentity } from './modules/student/realtime/student-draft-socket.js';
import { LeaderFailoverService } from './modules/student/application/leader-failover-service.js';
import { registerStudentMembershipSockets } from './modules/student/realtime/student-membership-sockets.js';
import type { StudentMembershipChangedPayload } from '@quiz/contracts';
import { StudentTrustedEndCoordinator } from './modules/student/application/student-trusted-end-coordinator.js';
import { StudentWinnerResolver } from './modules/student/application/winner-resolver.js';

/** Supplied to the Teacher-owned router only after the shared services are ready. */
export interface TeacherServiceDependencies {
  readonly database: Database.Database;
  readonly sessionLifecycle: SessionLifecycleService;
  readonly endCoordinator: StudentTrustedEndCoordinator;
}

export interface FoundationServerOptions extends ApiRouterOptions, SocketServerOptions {
  readonly studentSecurity?: StudentSecurityOptions;
  readonly studentDraftService?: DraftService;
  readonly studentSubmissionService?: SubmissionService;
  readonly publishStudentMembership?: (scope: StudentMembershipChangedPayload) => void;
  readonly studentOnlineParticipants?: (scope: StudentMembershipChangedPayload) => ReadonlySet<UUID>;
  readonly createTeacherRouter?: (services: TeacherServiceDependencies) => ExpressRouter;
}

/** Teacher supplies these adapters; the default startup installs no Teacher authority. */
export type TeacherIntegrationOptions = Pick<FoundationServerOptions,
  'createTeacherRouter' | 'resolveActorContext' | 'resolveSocketActorContext' | 'authorizeWatch'>;

export function createApp(options: FoundationServerOptions = {}) {
  const app = express();
  const identity = options.database ? new StudentIdentityService(createStudentRepositories(options.database)) : null;
  app.use('/api/v1', createApiRouter({ ...options,
    resolveActorContext: request => {
      const supplied = options.resolveActorContext?.(request);
      if (supplied) return supplied;
      const scope = parseUUID(/^\/sessions\/([^/]+)(?:\/|$)/.exec(request.path)?.[1]);
      return scope ? identity?.resolve(request.headers.cookie, scope)?.actorContext ?? null : null;
    },
    studentRouter: createStudentRouter(options.database,options.studentSecurity,options.activityCodeRateLimit,options.studentDraftService,options.studentSubmissionService,options.publishStudentMembership,options.studentOnlineParticipants) }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function createHttpServer(options: FoundationServerOptions = {}) {
  if (options.createTeacherRouter && !options.database) {
    throw new Error('Teacher router composition requires the shared Database.');
  }
  if (options.createTeacherRouter && options.teacherRouter) {
    throw new Error('Supply either a Teacher router factory or an existing router.');
  }
  // Mount this container before terminal 404/error handlers, then populate it once services exist.
  const teacherRouter = options.createTeacherRouter ? Router() : options.teacherRouter;
  const identity=options.database?new StudentIdentityService(createStudentRepositories(options.database)):null;
  const studentSocket=options.studentSocket??(identity&&options.studentSecurity?{allowedOrigins:options.studentSecurity.allowedOrigins,resolveIdentity:(cookie:string|undefined,id:import('@quiz/contracts/domain').UUID)=>identity.resolve(cookie,id)}:undefined);
  let socketServer:ReturnType<typeof createSocketServer>;
  const draft=options.database?new DraftService(options.database,(teamId,change)=>{
    for(const socket of socketServer.sockets.sockets.values()){
      const current=studentSocket?.resolveIdentity(socket.request.headers.cookie,change.sessionId);
      const room=current?studentDraftRoomName(current.actorContext,change.roundId):null;
      if(current?.actorContext.teamId===teamId&&room&&socket.rooms.has(room)) (socket as unknown as StudentEventSocket).emit('student:draft:changed',change);
    }
  }):undefined;
  const submission=options.database?new SubmissionService(options.database,(teamId,lock)=>publishStudentDraftLock(socketServer,studentSocket,teamId,lock)):undefined;
  let membership: ReturnType<typeof registerStudentMembershipSockets> | undefined;
  const app = createApp({...options,teacherRouter,studentDraftService:draft,studentSubmissionService:submission,publishStudentMembership:scope=>membership?.publish(scope),studentOnlineParticipants:scope=>membership?.onlineParticipants(scope) ?? new Set()});
  const httpServer = createServer(app);
  const stateService = options.database ? new SessionStateService(options.database) : null;
  const studentActors = new WeakSet<object>();
  socketServer = createSocketServer(httpServer, {
    ...options,
    resolveSocketActorContext: socket => {
      const initial = getStudentSocketIdentity(socket);
      if (initial) {
        const resolved = studentSocket?.resolveIdentity(socket.request.headers.cookie, initial.sessionId);
        if (!resolved || resolved.credentialId !== initial.credentialId
          || resolved.actorContext.actorKind !== 'participant'
          || resolved.actorContext.actorId !== initial.actorContext.actorId
          || resolved.actorContext.sessionId !== initial.sessionId) return null;
        studentActors.add(resolved.actorContext);
        return resolved.actorContext;
      }
      // auth selects a validation path, never authority. An unverified Student path fails closed.
      if (socket.handshake.auth?.sessionId !== undefined) return null;
      return options.resolveSocketActorContext?.(socket) ?? null;
    },
    authorizeWatch: (actor, sessionId) => {
      if (!studentActors.has(actor)) return options.authorizeWatch?.(actor, sessionId) ?? false;
      if (actor.actorKind !== 'participant' || actor.sessionId !== sessionId || !actor.teamId || !actor.permissions.includes('session:watch')) return false;
      membership?.reconcile({sessionId,teamId:actor.teamId});
      return true;
    },
    studentSocket:studentSocket?{...studentSocket,draftService:draft,csrf:options.studentSecurity?createStudentCsrfService({secret:options.studentSecurity.secret}):undefined,
      onAuthorizedDraftWatch:scope=>membership?.reconcile(scope)}:undefined,
    getSessionState: options.getSessionState ?? (stateService ? (sessionId) => stateService.getSnapshot(sessionId) : undefined),
  });
  if (options.database && studentSocket) {
    membership = registerStudentMembershipSockets(socketServer, studentSocket, new LeaderFailoverService(options.database));
  }
  const statePublisher = new SessionStatePublisher(socketServer);
  const sessionLifecycle = options.database
    ? new SessionLifecycleService(options.database, { publish: (snapshot) => { statePublisher.publish(snapshot); } })
    : null;
  const winnerResolver = options.database ? new StudentWinnerResolver(options.database) : null;
  const endCoordinator = sessionLifecycle && winnerResolver
    ? new StudentTrustedEndCoordinator(sessionLifecycle, winnerResolver)
    : null;
  if (options.createTeacherRouter && teacherRouter && options.database && sessionLifecycle && endCoordinator) {
    teacherRouter.use(options.createTeacherRouter({ database: options.database, sessionLifecycle, endCoordinator }));
  }
  return { app, httpServer, socketServer, sessionLifecycle, statePublisher, endCoordinator };
}

export function startServer(teacherIntegration: TeacherIntegrationOptions = {}) {
  const config = parseEnvironment();
  const databaseManager = new DatabaseManager({ sqlitePath: config.sqlitePath });
  const database = databaseManager.open();
  runMigrations(database);
  const studentIdentity = new StudentIdentityService(createStudentRepositories(database));

  const { httpServer } = createHttpServer({
    ...teacherIntegration,
    database,
    studentSecurity:config.studentCsrfSecret?{secret:config.studentCsrfSecret,allowedOrigins:config.studentAllowedOrigins,nodeEnv:config.nodeEnv}:undefined,
    studentSocket: {
      allowedOrigins: config.studentAllowedOrigins,
      resolveIdentity: (cookieHeader, sessionId) => studentIdentity.resolve(cookieHeader, sessionId),
    },
    activityCodeRateLimit: {
      maxRequests: config.activityCodeLookupMaxRequests,
      windowMs: config.activityCodeLookupWindowMs,
    },
  });
  httpServer.once('close', () => databaseManager.close());
  const port = config.port;
  httpServer.listen(port, '127.0.0.1', () => {
    console.info(`Shared server listening on http://127.0.0.1:${port}`);
    console.info(`SQLite file configured at ${config.sqlitePath}`);
    console.info(`Runtime: ${config.nodeEnv}; Student origins: ${config.studentAllowedOrigins.join(', ')}; CSRF secret configured: ${config.studentCsrfSecret !== null}`);
  });
  return httpServer;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer();
}
