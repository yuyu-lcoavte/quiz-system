import { beforeEach, describe, expect, it } from 'vitest';
import { ids, blank, createFoundationTestContext, question, questionGroup, round, session, submission, team } from '../helpers/foundation.js';

describe('Submission and Result persistence', () => {
  let context: ReturnType<typeof createFoundationTestContext>;

  beforeEach(() => {
    context = createFoundationTestContext();
    context.repositories.sessions.create(session());
  });

  it('stores the trusted backend acceptedOrder and enforces Team/Round and Round/order uniqueness', () => {
    context.repositories.questions.create(question());
    context.repositories.teams.create(team(ids.team1));
    context.repositories.teams.create(team(ids.team2));
    context.repositories.rounds.create(round());
    context.repositories.submissions.create(submission(ids.submission1, ids.team1, ids.round1, 1));

    expect(context.repositories.submissions.findById(ids.submission1)?.acceptedOrder).toBe(1);
    expect(() => context.repositories.submissions.create(submission(ids.submission2, ids.team1, ids.round1, 2))).toThrow();
    expect(() => context.repositories.submissions.create(submission(ids.submission2, ids.team2, ids.round1, 1))).toThrow();
  });

  it('rejects a Submission whose Team and Round belong to different Sessions', () => {
    context.repositories.sessions.create(session(ids.session2));
    context.repositories.questions.create(question(ids.question1, ids.session1));
    context.repositories.questions.create(question(ids.questionOtherSession, ids.session2));
    context.repositories.teams.create(team(ids.teamOtherSession, ids.session2));
    context.repositories.rounds.create(round(ids.round1, ids.session1, { questionId: ids.question1 }));

    expect(() => context.repositories.submissions.create(submission(ids.submission1, ids.teamOtherSession, ids.round1))).toThrow();
  });

  it('links answers to valid target Blanks and returns answers in Question/Blank order', () => {
    context.repositories.questionGroups.create(questionGroup());
    context.repositories.questions.create(question(ids.question1, ids.session1, { questionGroupId: ids.group1, position: 1 }));
    context.repositories.questions.create(question(ids.question2, ids.session1, { questionGroupId: ids.group1, position: 0 }));
    context.repositories.questions.create(question(ids.question3));
    context.repositories.blanks.create(blank(ids.blank1, ids.question1, 0));
    context.repositories.blanks.create(blank(ids.blank2, ids.question2, 0));
    context.repositories.blanks.create(blank(ids.blankOther, ids.question3, 0));
    context.repositories.teams.create(team());
    context.repositories.rounds.create(round(ids.round1, ids.session1, { questionGroupId: ids.group1 }));
    context.repositories.submissions.create(submission());
    context.repositories.submissionAnswers.create({ submissionId: ids.submission1, blankId: ids.blank1, value: 'later question' });
    context.repositories.submissionAnswers.create({ submissionId: ids.submission1, blankId: ids.blank2, value: 'first question' });

    expect(context.repositories.submissionAnswers.listBySubmission(ids.submission1).map(({ value }) => value)).toEqual([
      'first question',
      'later question',
    ]);
    expect(() => context.repositories.submissionAnswers.create({
      submissionId: ids.submission1,
      blankId: ids.blankOther,
      value: 'outside target',
    })).toThrow();
  });

  it('enforces same-Round Result winners and replaces a target Result with the new Round result', () => {
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
    context.repositories.rounds.create(round(ids.round2));
    context.repositories.submissions.create(submission(ids.submission2, ids.team1, ids.round2, 1));

    expect(() => context.repositories.results.create({
      id: ids.result2,
      roundId: ids.round2,
      winningSubmissionId: ids.submission1,
      createdAt: '2026-11-09T03:00:00.000Z',
    })).toThrow();

    context.repositories.results.replaceForTarget({
      id: ids.result2,
      roundId: ids.round2,
      winningSubmissionId: ids.submission2,
      createdAt: '2026-11-09T03:00:00.000Z',
    });

    expect(context.repositories.results.listByTarget(ids.session1, { kind: 'question', questionId: ids.question1 })).toEqual([
      expect.objectContaining({ id: ids.result2, roundId: ids.round2 }),
    ]);
  });
});
