import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../apps/server/src/app.js';

describe('Student router foundation', () => {
  it('mounts the Student route root inside the shared API and uses the common error envelope', async () => {
    const response = await request(createApp()).get('/api/v1/student/not-yet-implemented');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'TARGET_NOT_FOUND' });
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });
});
