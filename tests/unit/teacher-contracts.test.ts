import { describe, expect, it } from 'vitest';
import {
  parseTeacherCreateSessionRequest,
  parseTeacherExpectedVersionRequest,
  parseTeacherImportConfirmRequest,
  parseTeacherImportPreviewRequest,
  parseTeacherLoginRequest,
  parseTeacherSelectTargetRequest,
  parseTeacherWriteBackConfirmRequest,
  TEACHER_MAX_TEAMS,
} from '../../packages/contracts/src/teacher.js';

const questionId = '11111111-1111-4111-8111-111111111111';
const digest = 'a'.repeat(64);

describe('Teacher contract request validators', () => {
  it('accepts teamCount as an integer from 1 to 20', () => {
    expect(TEACHER_MAX_TEAMS).toBe(20);
    expect(parseTeacherCreateSessionRequest({ teamCount: 1 })).toEqual({ teamCount: 1 });
    expect(parseTeacherCreateSessionRequest({ teamCount: 20 })).toEqual({ teamCount: 20 });
    for (const teamCount of [0, 21, 2.5, -1, '3', null, Number.NaN]) {
      expect(parseTeacherCreateSessionRequest({ teamCount })).toBeNull();
    }
    expect(parseTeacherCreateSessionRequest(null)).toBeNull();
    expect(parseTeacherCreateSessionRequest([])).toBeNull();
  });

  it('accepts expectedStateVersion as a non-negative safe integer', () => {
    expect(parseTeacherExpectedVersionRequest({ expectedStateVersion: 0 })).toEqual({ expectedStateVersion: 0 });
    expect(parseTeacherExpectedVersionRequest({ expectedStateVersion: 7 })).toEqual({ expectedStateVersion: 7 });
    for (const expectedStateVersion of [-1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1, undefined]) {
      expect(parseTeacherExpectedVersionRequest({ expectedStateVersion })).toBeNull();
    }
  });

  it('validates a select-target request with a Question or QuestionGroup reference', () => {
    expect(parseTeacherSelectTargetRequest({ target: { kind: 'question', questionId }, expectedStateVersion: 3 }))
      .toEqual({ target: { kind: 'question', questionId }, expectedStateVersion: 3 });
    expect(parseTeacherSelectTargetRequest({ target: { kind: 'questionGroup', questionGroupId: questionId }, expectedStateVersion: 0 }))
      .toEqual({ target: { kind: 'questionGroup', questionGroupId: questionId }, expectedStateVersion: 0 });
    expect(parseTeacherSelectTargetRequest({ target: { kind: 'question', questionId: 'not-a-uuid' }, expectedStateVersion: 0 })).toBeNull();
    expect(parseTeacherSelectTargetRequest({ target: { kind: 'other', questionId }, expectedStateVersion: 0 })).toBeNull();
    expect(parseTeacherSelectTargetRequest({ target: { kind: 'question', questionId } })).toBeNull();
  });

  it('accepts a non-empty url of at most 2048 characters', () => {
    expect(parseTeacherImportPreviewRequest({ url: 'https://docs.google.com/spreadsheets/d/x' }))
      .toEqual({ url: 'https://docs.google.com/spreadsheets/d/x' });
    expect(parseTeacherImportPreviewRequest({ url: '' })).toBeNull();
    expect(parseTeacherImportPreviewRequest({ url: 'h'.repeat(2049) })).toBeNull();
    expect(parseTeacherImportPreviewRequest({ url: 42 })).toBeNull();
  });

  it('requires digests of 64 lowercase hex characters', () => {
    expect(parseTeacherImportConfirmRequest({ url: 'https://x', previewDigest: digest }))
      .toEqual({ url: 'https://x', previewDigest: digest });
    expect(parseTeacherImportConfirmRequest({ url: 'https://x', previewDigest: 'A'.repeat(64) })).toBeNull();
    expect(parseTeacherImportConfirmRequest({ url: 'https://x', previewDigest: 'a'.repeat(63) })).toBeNull();
    expect(parseTeacherWriteBackConfirmRequest({ planDigest: digest })).toEqual({ planDigest: digest });
    expect(parseTeacherWriteBackConfirmRequest({ planDigest: 'g'.repeat(64) })).toBeNull();
  });

  it('accepts a non-empty password string', () => {
    expect(parseTeacherLoginRequest({ password: 'secret' })).toEqual({ password: 'secret' });
    expect(parseTeacherLoginRequest({ password: '' })).toBeNull();
    expect(parseTeacherLoginRequest({ password: 'p'.repeat(1025) })).toBeNull();
    expect(parseTeacherLoginRequest({})).toBeNull();
  });

  it('ignores unknown fields such as client-claimed role or winner', () => {
    expect(parseTeacherCreateSessionRequest({ teamCount: 2, actorKind: 'teacher', permissions: ['round:end'] }))
      .toEqual({ teamCount: 2 });
    expect(parseTeacherExpectedVersionRequest({ expectedStateVersion: 1, winningSubmissionId: questionId, acceptedOrder: 1 }))
      .toEqual({ expectedStateVersion: 1 });
  });
});
