import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { it,expect } from 'vitest';
import { createTestDatabase } from '../helpers/sqlite.js';
it('prepares an isolated UI database only in test mode and refuses to overwrite it',()=>{
 const isolated=createTestDatabase();const path=join(isolated.directory,'student-ui-demo.sqlite');
 const run=(mode:string)=>spawnSync(process.execPath,['--import','tsx/esm','tests/fixtures/student-ui-demo.ts'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:mode,STUDENT_UI_FIXTURE_PATH:path},encoding:'utf8',timeout:15000});
 expect(run('production').status).toBe(1);expect(existsSync(path)).toBe(false);
 const prepared=run('test');expect(prepared.status,prepared.stderr).toBe(0);expect(run('test').status).toBe(1);
 const db=new Database(path,{readonly:true});try{expect(db.prepare('SELECT count(*) n FROM sessions').get()).toEqual({n:3});expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);}finally{db.close();}
});
