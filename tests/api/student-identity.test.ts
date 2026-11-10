import request from 'supertest';
import { it, expect } from 'vitest';
import { studentFixture, cookieOf } from '../helpers/student.js';
import { createApp } from '../../apps/server/src/app.js';
import { ids } from '../helpers/foundation.js';
it('recovers the same member using HttpOnly cookie and refuses revoked or forged credentials', async()=>{
 const f=studentFixture(); const a=await f.join(); const cookie=cookieOf(a);
 expect(a.headers['set-cookie'][0]).toMatch(/HttpOnly/); expect(a.headers['set-cookie'][0]).toMatch(/Path=\//); expect(a.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
 expect(JSON.stringify(a.body)).not.toContain(cookie.split('=')[1]);
 const me=await request(f.app).get(`${f.base}/me`).set('Cookie',cookie); expect(me.body.data.participantId).toBe(a.body.data.participantId);
 expect((await request(f.app).get(`${f.base}/me`).set('Cookie','student_session=forged')).status).toBe(401);
 const csrf=await request(f.app).get(`${f.base}/csrf-token`).set('Cookie',cookie); expect(csrf.headers['cache-control']).toBe('no-store');
 f.database.prepare('UPDATE student_browser_credentials SET revoked_at=?').run(new Date().toISOString());
 expect((await request(f.app).get(`${f.base}/me`).set('Cookie',cookie)).status).toBe(401);
});
it('rejects expired and cross-Session recovery and never restores by display name',async()=>{
 const f=studentFixture();const a=await f.join();const cookie=cookieOf(a);
 expect((await request(f.app).get('/api/v1/student/sessions/00000000-0000-4000-8000-000000000002/me').set('Cookie',cookie)).status).toBe(401);
 expect((await request(f.app).get(`${f.base}/me?displayName=Student`)).status).toBe(401);
 f.database.prepare('UPDATE student_browser_credentials SET created_at=?,expires_at=?').run('2000-01-01T00:00:00.000Z','2001-01-01T00:00:00.000Z');
 expect((await request(f.app).get(`${f.base}/me`).set('Cookie',cookie)).status).toBe(401);
});
it('preserves the original leader across app recreation; the same name without its Cookie is a new member',async()=>{
 const f=studentFixture();const first=await f.join('AAA');const cookie=cookieOf(first);
 const restarted=createApp({database:f.database,studentSecurity:{secret:'test-secret-'.repeat(4),allowedOrigins:['http://127.0.0.1:5173']}});
 const restored=await request(restarted).get(`${f.base}/me`).set('Cookie',cookie);expect(restored.body.data.participantId).toBe(first.body.data.participantId);expect(restored.body.data.isLeader).toBe(true);
 const another=await request(restarted).post(`${f.base}/enrollments`).set('Origin','http://127.0.0.1:5173').send({teamId:ids.team1,displayName:'AAA'});
 expect(another.body.data.participantId).not.toBe(first.body.data.participantId);expect(another.body.data.isLeader).toBe(false);
 expect((await request(restarted).get(`${f.base}/me`).set('Cookie',cookie)).body.data.isLeader).toBe(true);
});
