import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { it,expect } from 'vitest';
import { createTestDatabase } from '../helpers/sqlite.js';
import { SessionQueryService } from '../../apps/server/src/modules/sessions/application/session-query-service.js';
it('prepares an isolated UI database only in test mode and refuses to overwrite it',()=>{
 const isolated=createTestDatabase();const path=join(isolated.directory,'student-ui-demo.sqlite');
 const run=(mode:string)=>spawnSync(process.execPath,['--import','tsx/esm','tests/fixtures/student-ui-demo.ts'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:mode,STUDENT_UI_FIXTURE_PATH:path},encoding:'utf8',timeout:15000});
 expect(run('production').status).toBe(1);expect(existsSync(path)).toBe(false);
 const prepared=run('test');expect(prepared.status,prepared.stderr).toBe(0);expect(run('test').status).toBe(1);
 const db = new Database(path, { readonly: true });
 try {
  const query = new SessionQueryService(db);
  expect(db.prepare('SELECT count(*) n FROM sessions').get()).toEqual({n:4});
  const single = query.lookupActivityCode('DEMO-SINGLE-ACTIVE');
  expect(single.phase).toBe('Active');
  const singleTarget = query.getCurrentTarget(single.sessionId)?.target;
  expect(singleTarget?.kind).toBe('question');
  if (singleTarget?.kind === 'question') expect(singleTarget.question.blanks).toHaveLength(2);

  const grouped = query.lookupActivityCode('DEMO-ACTIVE');
  expect(grouped.phase).toBe('Active');
  const groupTarget = query.getCurrentTarget(grouped.sessionId)?.target;
  expect(groupTarget?.kind).toBe('questionGroup');
  if (groupTarget?.kind === 'questionGroup') expect(groupTarget.questionGroup.questions.map(q => q.blanks.length)).toEqual([2, 2]);
  expect(query.lookupActivityCode('DEMO-WAIT').phase).toBe('Waiting');
  expect(query.lookupActivityCode('DEMO-ENDED').phase).toBe('Ended');
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 } finally {
  db.close();
 }
}, 20_000);
