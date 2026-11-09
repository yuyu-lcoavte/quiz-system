import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWaitingRound, endRoundWithResult } from '../../apps/server/src/modules/sessions/application/foundation-transactions.js';
import { blank, createFoundationTestContext, ids, question, questionGroup, round, session, submission, team } from '../helpers/foundation.js';

describe('Foundation persistence constraints and transactions', () => {
  let context: ReturnType<typeof createFoundationTestContext>;

  beforeEach(() => {
    context = createFoundationTestContext();
  });

  it('uses a temporary test database rather than the normal development database', () => {
    expect(context.path.startsWith(tmpdir())).toBe(true);
    expect(context.path).not.toContain('quiz-system/data');
  });

  it('enforces cross-Session and target constraints in SQLite when repositories are bypassed', () => {
    context.repositories.sessions.create(session(ids.session1));
    context.repositories.sessions.create(session(ids.session2));
    context.repositories.questions.create(question(ids.question1, ids.session1));
    context.repositories.questions.create(question(ids.questionOtherSession, ids.session2));
    context.repositories.blanks.create(blank(ids.blankOther, ids.questionOtherSession));
    context.repositories.questionGroups.create(questionGroup(ids.group1, ids.session1));
    context.repositories.teams.create(team(ids.team1, ids.session1));
    context.repositories.teams.create(team(ids.teamOtherSession, ids.session2));
    context.repositories.rounds.create(round(ids.round1, ids.session1, { questionId: ids.question1 }));
    context.repositories.rounds.create(round(ids.round2, ids.session1, { questionId: ids.question1 }));
    context.repositories.submissions.create(submission(ids.submission1, ids.team1, ids.round1, 1));

    expect(() => context.database.prepare(`INSERT INTO rounds
      (id, session_id, question_id, question_group_id, phase, created_at)
      VALUES (?, ?, ?, NULL, 'Waiting', ?)`).run(
      ids.roundOtherSession, ids.session1, ids.questionOtherSession, '2026-11-09T01:00:00.000Z',
    )).toThrow();
    expect(() => context.database.prepare(`INSERT INTO rounds
      (id, session_id, question_id, question_group_id, phase, created_at)
      VALUES (?, ?, NULL, ?, 'Waiting', ?)`).run(
      ids.round3, ids.session1, ids.group1, '2026-11-09T01:00:00.000Z',
    )).toThrow();
    expect(() => context.database.prepare(`INSERT INTO submissions
      (id, team_id, round_id, received_at, accepted_order) VALUES (?, ?, ?, ?, ?)`).run(
      ids.submission2, ids.teamOtherSession, ids.round1, '2026-11-09T02:00:00.000Z', 2,
    )).toThrow();
    expect(() => context.database.prepare(`INSERT INTO submission_answers
      (submission_id, blank_id, value) VALUES (?, ?, ?)`).run(
      ids.submission1, ids.blankOther, 'outside target',
    )).toThrow();
    expect(() => context.database.prepare(`INSERT INTO results
      (id, round_id, winning_submission_id, created_at) VALUES (?, ?, ?, ?)`).run(
      ids.result1, ids.round2, ids.submission1, '2026-11-09T03:00:00.000Z',
    )).toThrow();
  });

  it('rolls back an inserted Round when the Session version compare-and-swap fails', () => {
    context.repositories.sessions.create(session());
    context.repositories.questions.create(question());

    expect(() =>
      createWaitingRound(context.database, {
        id: ids.round1,
        sessionId: ids.session1,
        target: { kind: 'question', questionId: ids.question1 },
        createdAt: '2026-11-09T02:00:00.000Z',
        expectedStateVersion: 10,
      }),
    ).toThrow();

    expect(context.repositories.rounds.findById(ids.round1)).toBeNull();
    expect(context.repositories.sessions.findById(ids.session1)?.currentRoundId).toBeNull();
    expect(context.repositories.sessions.findById(ids.session1)?.stateVersion).toBe(0);
  });

  it('rolls back deletion of the prior target Result when replacement insert fails', () => {
    context.repositories.sessions.create(session());
    context.repositories.questions.create(question());
    context.repositories.teams.create(team());
    context.repositories.rounds.create(round(ids.round1));
    context.repositories.rounds.create(round(ids.round2));
    context.repositories.submissions.create(submission(ids.submission1, ids.team1, ids.round1, 1));
    context.repositories.results.create({
      id: ids.result1,
      roundId: ids.round1,
      winningSubmissionId: ids.submission1,
      createdAt: '2026-11-09T02:00:00.000Z',
    });

    expect(() => context.repositories.results.replaceForTarget({
      id: ids.result2,
      roundId: ids.round2,
      winningSubmissionId: ids.submission1,
      createdAt: '2026-11-09T03:00:00.000Z',
    })).toThrow();
    expect(context.repositories.results.listByTarget(ids.session1, { kind: 'question', questionId: ids.question1 })).toEqual([
      expect.objectContaining({ id: ids.result1, roundId: ids.round1 }),
    ]);
  });

  it('keeps a failed invalid target from changing the Session version or current Round', () => {
    context.repositories.sessions.create(session());
    context.repositories.questions.create(question());

    expect(() => createWaitingRound(context.database, {
      id: ids.round1,
      sessionId: ids.session1,
      target: { kind: 'questionGroup', questionGroupId: ids.group1 },
      createdAt: '2026-11-09T02:00:00.000Z',
      expectedStateVersion: 0,
    })).toThrow();

    expect(context.repositories.sessions.findById(ids.session1)).toMatchObject({ stateVersion: 0, currentRoundId: null });
  });

  it('commits Ended and the replacement Result together, and rolls both back for an invalid winner', () => {
    context.repositories.sessions.create(session());
    context.repositories.questions.create(question());
    context.repositories.teams.create(team());
    context.repositories.rounds.create(round(ids.round1));
    context.repositories.submissions.create(submission(ids.submission1, ids.team1, ids.round1, 1));
    context.repositories.results.create({
      id: ids.result1,
      roundId: ids.round1,
      winningSubmissionId: ids.submission1,
      createdAt: '2026-11-09T02:00:00.000Z',
    });
    context.repositories.rounds.create({ ...round(ids.round2), phase: 'Active', startedAt: '2026-11-09T03:00:00.000Z' });
    context.repositories.submissions.create(submission(ids.submission2, ids.team1, ids.round2, 1));
    context.database.prepare('UPDATE sessions SET current_round_id = ?, state_version = 1 WHERE id = ?').run(ids.round2, ids.session1);

    expect(() => endRoundWithResult(context.database, {
      roundId: ids.round2,
      endedAt: '2026-11-09T04:00:00.000Z',
      expectedStateVersion: 1,
      result: {
        id: ids.result2,
        roundId: ids.round2,
        winningSubmissionId: ids.submission1,
        createdAt: '2026-11-09T04:00:00.000Z',
      },
    })).toThrow();

    expect(context.repositories.rounds.findById(ids.round2)?.phase).toBe('Active');
    expect(context.repositories.sessions.findById(ids.session1)?.stateVersion).toBe(1);
    expect(context.repositories.results.findByRound(ids.round1)?.id).toBe(ids.result1);

    const completed = endRoundWithResult(context.database, {
      roundId: ids.round2,
      endedAt: '2026-11-09T04:00:00.000Z',
      expectedStateVersion: 1,
      result: {
        id: ids.result2,
        roundId: ids.round2,
        winningSubmissionId: ids.submission2,
        createdAt: '2026-11-09T04:00:00.000Z',
      },
    });

    expect(completed.round.phase).toBe('Ended');
    expect(completed.session.stateVersion).toBe(2);
    expect(completed.result?.id).toBe(ids.result2);
    expect(context.repositories.results.listByTarget(ids.session1, { kind: 'question', questionId: ids.question1 })).toEqual([
      expect.objectContaining({ id: ids.result2, roundId: ids.round2 }),
    ]);
  });
});
