import request from 'supertest';
import { it, expect } from 'vitest';
import { studentFixture } from '../helpers/student.js';
it('returns only public join choices, rejects missing/invalid codes and throttles', async () => {
 const f = studentFixture(2);
 const r = await request(f.app).get('/api/v1/student/join-options/ACT-0001');
 expect(r.status).toBe(200); expect(Object.keys(r.body.data).sort()).toEqual(['phase','sessionId','teams']);
 expect(r.body.data.teams).toHaveLength(2); expect(r.headers['set-cookie']).toBeUndefined();
 expect((await request(f.app).get('/api/v1/student/join-options/unknown')).status).toBe(404);
 expect((await request(f.app).get('/api/v1/student/join-options/%20')).status).toBe(400);
 await request(f.app).get('/api/v1/student/join-options/ACT-0001');
 expect((await request(f.app).get('/api/v1/student/join-options/ACT-0001')).status).toBe(429);
});
