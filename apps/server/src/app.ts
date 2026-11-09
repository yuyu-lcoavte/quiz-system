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

export interface FoundationServerOptions extends ApiRouterOptions, SocketServerOptions {}

export function createApp(options: FoundationServerOptions = {}) {
  const app = express();
  app.use('/api/v1', createApiRouter(options));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function createHttpServer(options: FoundationServerOptions = {}) {
  const app = createApp(options);
  const httpServer = createServer(app);
  const stateService = options.database ? new SessionStateService(options.database) : null;
  const socketServer = createSocketServer(httpServer, {
    ...options,
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

  const { httpServer } = createHttpServer({
    database,
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
