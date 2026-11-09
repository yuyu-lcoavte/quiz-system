import { describe, expect, it } from 'vitest';
import {
  validateBlank,
  validateBlankTargetMembership,
  validateQuestion,
  validateQuestionGroup,
  validateQuestionGroupTarget,
  validateResultWinner,
  validateRoundTargetShape,
  validateSameSession,
} from '../../apps/server/src/modules/sessions/domain/model-validation.js';
import { ids, blank, question, questionGroup } from '../helpers/foundation.js';

describe('Foundation domain validators', () => {
  it('accepts Questions with zero Blanks and QuestionGroups with zero Questions as incomplete data', () => {
    expect(() => validateQuestion(question())).not.toThrow();
    expect(() => validateQuestionGroup(questionGroup())).not.toThrow();
  });

  it('rejects malformed UUIDs and invalid positions for Questions and Blanks', () => {
    expect(() => validateQuestion({ ...question(), id: 'bad-id' as never })).toThrow();
    expect(() => validateQuestion({ ...question(), position: -1 })).toThrow();
    expect(() => validateBlank({ ...blank(), position: 1.5 })).toThrow();
  });

  it('requires exactly one Round target', () => {
    expect(() => validateRoundTargetShape(ids.question1, null)).not.toThrow();
    expect(() => validateRoundTargetShape(null, ids.group1)).not.toThrow();
    expect(() => validateRoundTargetShape(null, null)).toThrow();
    expect(() => validateRoundTargetShape(ids.question1, ids.group1)).toThrow();
  });

  it('rejects an empty QuestionGroup only when it is selected as a Round target', () => {
    expect(() => validateQuestionGroupTarget(2)).not.toThrow();
    expect(() => validateQuestionGroupTarget(0)).toThrow();
  });

  it('rejects cross-Session relationships and Blanks outside a Round target', () => {
    expect(() => validateSameSession(ids.session1, ids.session1, 'Team and Round')).not.toThrow();
    expect(() => validateSameSession(ids.session1, ids.session2, 'Team and Round')).toThrow();
    expect(() => validateBlankTargetMembership(true)).not.toThrow();
    expect(() => validateBlankTargetMembership(false)).toThrow();
  });

  it('requires a Result winner to belong to the corresponding Round', () => {
    expect(() => validateResultWinner(ids.round1, ids.round1)).not.toThrow();
    expect(() => validateResultWinner(ids.round1, ids.round2)).toThrow();
  });
});
