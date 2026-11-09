import { beforeEach, describe, expect, it } from 'vitest';
import { createWaitingRound } from '../../apps/server/src/modules/sessions/application/foundation-transactions.js';
import { HttpError } from '../../apps/server/src/errors/http-error.js';
import { blank, createFoundationTestContext, ids, question, questionGroup, round, session, team } from '../helpers/foundation.js';

describe('Foundation relational model', () => {
  let context: ReturnType<typeof createFoundationTestContext>;

  beforeEach(() => {
    context = createFoundationTestContext();
  });

  it('creates a Session before any Round or Team exists', () => {
    const created = context.repositories.sessions.create(session());
    expect(created.currentRoundId).toBeNull();
    expect(context.repositories.rounds.listBySession(ids.session1)).toEqual([]);
    expect(context.repositories.teams.listBySession(ids.session1)).toEqual([]);
  });

  it('stores Questions with zero or multiple Blanks and empty or populated QuestionGroups', () => {
    context.repositories.sessions.create(session());
    context.repositories.questionGroups.create(questionGroup());
    expect(context.repositories.questionGroups.findById(ids.group1)?.questions).toEqual([]);
    context.repositories.questions.create(question(ids.question1));
    context.repositories.questions.create(
      question(ids.question2, ids.session1, { questionGroupId: ids.group1, position: 0 }),
    );
    context.repositories.questions.create(
      question(ids.question3, ids.session1, { questionGroupId: ids.group1, position: 1 }),
    );
    context.repositories.blanks.create(blank(ids.blank1, ids.question1, 0));
    context.repositories.blanks.create(blank(ids.blank2, ids.question1, 1));

    expect(context.repositories.questions.findById(ids.question1)?.blanks).toHaveLength(2);
    expect(context.repositories.questions.findById(ids.question2)?.blanks).toEqual([]);
    expect(context.repositories.questionGroups.findById(ids.group1)?.questions.map(({ id }) => id)).toEqual([
      ids.question2,
      ids.question3,
    ]);
  });

  it('allows an empty QuestionGroup to persist but rejects it as a Round target', () => {
    context.repositories.sessions.create(session());
    context.repositories.questionGroups.create(questionGroup());

    expect(() =>
      createWaitingRound(context.database, {
        id: ids.round1,
        sessionId: ids.session1,
        target: { kind: 'questionGroup', questionGroupId: ids.group1 },
        createdAt: '2026-11-09T02:00:00.000Z',
        expectedStateVersion: 0,
      }),
    ).toThrow(HttpError);
    expect(context.repositories.rounds.findById(ids.round1)).toBeNull();
  });

  it('rejects Round targets from another Session and Round targets that violate XOR', () => {
    context.repositories.sessions.create(session(ids.session1));
    context.repositories.sessions.create(session(ids.session2));
    context.repositories.questions.create(question(ids.questionOtherSession, ids.session2));
    context.repositories.questionGroups.create(questionGroup(ids.group1, ids.session1));
    context.repositories.questions.create(
      question(ids.question2, ids.session1, { questionGroupId: ids.group1 }),
    );

    expect(() => context.repositories.rounds.create(round(ids.round1, ids.session1, { questionId: ids.questionOtherSession }))).toThrow();
    expect(() =>
      context.database
        .prepare(`INSERT INTO rounds (id, session_id, question_id, question_group_id, phase, created_at)
          VALUES (?, ?, ?, ?, 'Waiting', ?)`)
        .run(ids.round1, ids.session1, ids.question1, ids.group1, '2026-11-09T01:00:00.000Z'),
    ).toThrow();
  });

  it('reopening the same logical target creates a distinct Waiting Round and advances the Session pointer', () => {
    context.repositories.sessions.create(session());
    context.repositories.questions.create(question());
    const first = createWaitingRound(context.database, {
      id: ids.round1,
      sessionId: ids.session1,
      target: { kind: 'question', questionId: ids.question1 },
      createdAt: '2026-11-09T02:00:00.000Z',
      expectedStateVersion: 0,
    });
    expect(() => createWaitingRound(context.database, {
      id: ids.round3,
      sessionId: ids.session1,
      target: { kind: 'question', questionId: ids.question1 },
      createdAt: '2026-11-09T02:30:00.000Z',
      expectedStateVersion: 1,
    })).toThrow();
    context.database.prepare("UPDATE rounds SET phase = 'Ended', ended_at = ? WHERE id = ?")
      .run('2026-11-09T02:45:00.000Z', ids.round1);
    context.database.prepare('UPDATE sessions SET state_version = 2 WHERE id = ?').run(ids.session1);
    const reopened = createWaitingRound(context.database, {
      id: ids.round2,
      sessionId: ids.session1,
      target: { kind: 'question', questionId: ids.question1 },
      createdAt: '2026-11-09T03:00:00.000Z',
      expectedStateVersion: 2,
    });

    expect(first.round.id).not.toBe(reopened.round.id);
    expect(reopened.round.phase).toBe('Waiting');
    expect(reopened.session.currentRoundId).toBe(ids.round2);
    expect(reopened.session.stateVersion).toBe(3);
    expect(context.repositories.rounds.listBySession(ids.session1)).toHaveLength(2);
  });

  it('enforces same-Session current Round references and leaves Teams independent', () => {
    context.repositories.sessions.create(session(ids.session1));
    context.repositories.sessions.create(session(ids.session2));
    context.repositories.questions.create(question(ids.question1, ids.session1));
    context.repositories.questions.create(question(ids.questionOtherSession, ids.session2));
    context.repositories.rounds.create(round(ids.round1, ids.session1, { questionId: ids.question1 }));
    context.repositories.rounds.create(round(ids.roundOtherSession, ids.session2, { questionId: ids.questionOtherSession }));
    context.repositories.teams.create(team(ids.team1, ids.session1));

    expect(() =>
      context.database
        .prepare('UPDATE sessions SET current_round_id = ? WHERE id = ?')
        .run(ids.roundOtherSession, ids.session1),
    ).toThrow();
  });
});
