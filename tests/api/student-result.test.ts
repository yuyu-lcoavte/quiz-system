import { it, expect } from 'vitest';
import request from 'supertest';
import { draftFixture } from '../helpers/student-draft.js';
import { cookieOf } from '../helpers/student.js';
import { ids, submission, round, TIME } from '../helpers/foundation.js';

it('projects only the persisted winner after Ended, with no losing or identity/order data', async () => {
  const f = await draftFixture();
  f.repositories.submissions.create(submission()); f.repositories.submissions.create(submission(ids.submission2, ids.team2, ids.round1, 2));
  f.repositories.submissionAnswers.create({ submissionId: ids.submission1, blankId: ids.blank1, value: 'winner' });
  f.repositories.submissionAnswers.create({ submissionId: ids.submission2, blankId: ids.blank1, value: 'loser' });
  // Choose the persisted Result deliberately, rather than recalculating from acceptedOrder on reads.
  f.repositories.results.create({ id: ids.result1, roundId: ids.round1, winningSubmissionId: ids.submission2, createdAt: TIME });
  const path = `${f.base}/rounds/${ids.round1}/result`;
  expect((await request(f.app).get(path).set('Cookie', cookieOf(f.a))).status).toBe(403);
  f.database.prepare("UPDATE rounds SET phase='Ended' WHERE id=?").run(ids.round1);
  const result = await request(f.app).get(path).set('Cookie', cookieOf(f.a)); expect(result.status).toBe(200);
  expect(result.body.data).toEqual({ roundId: ids.round1, winner: { teamId: ids.team2, teamName: 'Team 41', answers: [{ blankId: ids.blank1, label: 'Blank 1', value: 'loser' }] } });
  expect(JSON.stringify(result.body)).not.toMatch(/acceptedOrder|participantId|winningSubmissionId/);
  expect((await request(f.app).get(path)).status).toBe(401);
  expect((await request(f.app).get(path.replace(ids.session1, ids.session2)).set('Cookie', cookieOf(f.a))).status).toBe(401);
  f.repositories.rounds.create({ ...round(ids.round2), phase: 'Ended', startedAt: TIME, endedAt: TIME });
  f.database.prepare('UPDATE sessions SET current_round_id=? WHERE id=?').run(ids.round2, ids.session1);
  expect((await request(f.app).get(path).set('Cookie', cookieOf(f.a))).status).toBe(403);
  expect((await request(f.app).get(path.replace(ids.round1, ids.round2)).set('Cookie', cookieOf(f.a))).body.data).toEqual({ roundId: ids.round2, winner: null });
});
