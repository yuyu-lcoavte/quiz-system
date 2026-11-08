import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { getSqliteFilePath } from './config/sqlite.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  return app;
}

export function createHttpServer() {
  const app = createApp();
  const httpServer = createServer(app);
  const socketServer = new SocketServer(httpServer);
  return { app, httpServer, socketServer };
}

export function startServer() {
  const { httpServer } = createHttpServer();
  const port = Number(process.env.PORT ?? 3000);
  httpServer.listen(port, '127.0.0.1', () => {
    console.info(`Shared server listening on http://127.0.0.1:${port}`);
    console.info(`SQLite file configured at ${getSqliteFilePath()}`);
  });
  return httpServer;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryPath === fileURLToPath(import.meta.url)) {
  startServer();
}
