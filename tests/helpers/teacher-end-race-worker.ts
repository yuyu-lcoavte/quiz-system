import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { createHttpServer } from '../../apps/server/src/app.js';
import { DatabaseManager } from '../../apps/server/src/persistence/database.js';
import { createTeacherIntegration } from '../../apps/server/src/modules/teacher/integration.js';
import type { TeacherConfig } from '../../apps/server/src/modules/teacher/config.js';

interface RaceWorkerInput {
  databasePath: string;
  config: TeacherConfig;
  studentSecret: string;
  roundId: string;
  first: 'submit' | 'end';
  barrier: SharedArrayBuffer;
}

if (process.env.NODE_ENV !== 'test' || isMainThread || !parentPort) {
  throw new Error('This helper is only for isolated test worker threads.');
}
const input = workerData as RaceWorkerInput;
const gate = new Int32Array(input.barrier);
const manager = new DatabaseManager({ sqlitePath: input.databasePath, timeoutMs: 0 });
const database = manager.open();
database.function('test_hold_race_writer', (roundId: string) => {
  if (roundId !== input.roundId) return 0;
  parentPort!.postMessage({ type: 'locked', inTransaction: database.inTransaction });
  if (Atomics.wait(gate, 0, 0, 15_000) === 'timed-out') throw new Error('Test writer barrier timed out.');
  return 0;
});
// Only this connection is instrumented; no migration or persistent trigger is added.
database.exec(input.first === 'submit'
  ? 'CREATE TEMP TRIGGER test_hold_submit BEFORE INSERT ON submissions BEGIN SELECT test_hold_race_writer(NEW.round_id); END'
  : "CREATE TEMP TRIGGER test_hold_end BEFORE UPDATE OF phase ON rounds WHEN NEW.phase='Ended' BEGIN SELECT test_hold_race_writer(NEW.id); END");

const server = createHttpServer({ database, ...createTeacherIntegration(input.config),
  studentSecurity: { secret: input.studentSecret, allowedOrigins: input.config.allowedOrigins, nodeEnv: 'test' } });
const publish = server.statePublisher.publish.bind(server.statePublisher);
server.statePublisher.publish = snapshot => {
  parentPort!.postMessage({ type: 'published', inTransaction: database.inTransaction, snapshot });
  return publish(snapshot);
};
server.httpServer.listen(0, '127.0.0.1', () => {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Worker server has no TCP port.');
  parentPort!.postMessage({ type: 'ready', url: `http://127.0.0.1:${address.port}` });
});
parentPort.on('message', command => {
  if (command !== 'close') return;
  server.socketServer.close(() => { manager.close(); parentPort!.close(); });
});
