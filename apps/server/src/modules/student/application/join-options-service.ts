import type Database from 'better-sqlite3';
import { SessionQueryService } from '../../sessions/application/session-query-service.js';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { HttpError } from '../../../errors/http-error.js';
export class JoinOptionsService {
 constructor(private readonly database: Database.Database) {}
 get(code: string) {
  const normalized=code.trim().toUpperCase();
  if(!normalized || normalized.length>64 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new HttpError(400,'INVALID_INPUT','Invalid Activity Code.');
  const summary=new SessionQueryService(this.database).lookupActivityCode(normalized);
  return {...summary,teams:createFoundationRepositories(this.database).teams.listBySession(summary.sessionId).map(t=>({teamId:t.id,name:t.name}))};
 }
}
