import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
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

export interface FoundationServerOptions extends ApiRouterOptions, SocketServerOptions {readonly studentSecurity?:StudentSecurityOptions;readonly studentDraftService?:DraftService;readonly studentSubmissionService?:SubmissionService;}

export function createApp(options: FoundationServerOptions = {}) {
  const app = express();
  app.use('/api/v1', createApiRouter({ ...options, studentRouter: createStudentRouter(options.database,options.studentSecurity,options.activityCodeRateLimit,options.studentDraftService,options.studentSubmissionService) }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function createHttpServer(options: FoundationServerOptions = {}) {
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
  const app = createApp({...options,studentDraftService:draft,studentSubmissionService:submission});
  const httpServer = createServer(app);
  const stateService = options.database ? new SessionStateService(options.database) : null;
  socketServer = createSocketServer(httpServer, {
    ...options,
    studentSocket:studentSocket?{...studentSocket,draftService:draft,csrf:options.studentSecurity?createStudentCsrfService({secret:options.studentSecurity.secret}):undefined}:undefined,
    getSessionState: options.getSessionState ?? (stateService ? (sessionId) => stateService.getSnapshot(sessionId) : undefined),
  });
  const statePublisher = new SessionStatePublisher(socketServer);
  const sessionLifecycle = options.database
    ? new SessionLifecycleService(options.database, { publish: (snapshot) => { statePublisher.publish(snapshot); } })
    : null;
  return { app, httpServer, socketServer, sessionLifecycle, statePublisher };
}

export function startServer() {
  const config = parseEnvironment();
  const databaseManager = new DatabaseManager({ sqlitePath: config.sqlitePath });
  const database = databaseManager.open();
  runMigrations(database);
  const studentIdentity = new StudentIdentityService(createStudentRepositories(database));

  const { httpServer } = createHttpServer({
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
  });
  return httpServer;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer();
}
