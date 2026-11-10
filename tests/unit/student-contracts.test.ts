import { describe, expect, it } from 'vitest';
import { parseStudentEnrollmentRequest, parseStudentSessionScope } from '../../packages/contracts/src/student.js';
import {
  parseStudentDraftChangedPayload,
  parseStudentDraftEditPayload,
  parseStudentDraftLockedPayload,
  parseStudentDraftSnapshotPayload,
  parseStudentDraftWatchPayload,
} from '../../packages/contracts/src/student-realtime.js';

const sessionId = '00000000-0000-4000-8000-000000000001';
const roundId = '00000000-0000-4000-8000-000000000060';
const blankId = '00000000-0000-4000-8000-000000000030';
const mutationId = '00000000-0000-4000-8000-000000000202';

describe('Student HTTP contracts', () => {
  it('parses a valid enrollment request and rejects client-supplied identity authority', () => {
    expect(parseStudentEnrollmentRequest({ teamId: '00000000-0000-4000-8000-000000000040', displayName: 'Learner' }))
      .toEqual({ teamId: '00000000-0000-4000-8000-000000000040', displayName: 'Learner' });
    expect(parseStudentEnrollmentRequest({ teamId: 'not-a-uuid', displayName: 'Learner' })).toBeNull();
    expect(parseStudentEnrollmentRequest({ teamId: '00000000-0000-4000-8000-000000000040', displayName: 'Learner', participantId: 'forged' })).toBeNull();
    expect(parseStudentSessionScope(sessionId)).toBe(sessionId);
    expect(parseStudentSessionScope('forged-session')).toBeNull();
  });
});

describe('Student realtime contracts', () => {
  it('accepts only a Session/Round selector for a draft watch', () => {
    expect(parseStudentDraftWatchPayload({ sessionId, roundId })).toEqual({ sessionId, roundId });
    expect(parseStudentDraftWatchPayload({ sessionId, roundId, teamId: 'forged' })).toBeNull();
    expect(parseStudentDraftWatchPayload({ sessionId, roundId: 'bad' })).toBeNull();
  });

  it('validates a draft edit payload including CSRF and mutation identity', () => {
    const valid = { sessionId, roundId, blankId, value: 'answer', baseVersion: 0, clientMutationId: mutationId, csrfToken: 'signed-token' };
    expect(parseStudentDraftEditPayload(valid)).toEqual(valid);
    expect(parseStudentDraftEditPayload({ ...valid, csrfToken: '' })).toBeNull();
    expect(parseStudentDraftEditPayload({ ...valid, actorKind: 'teacher' })).toBeNull();
    expect(parseStudentDraftEditPayload({ ...valid, baseVersion: -1 })).toBeNull();
  });

  it('validates persisted snapshots and versioned change/lock events', () => {
    expect(parseStudentDraftSnapshotPayload({ sessionId, roundId, version: 2, status: 'editable', answers: [{ blankId, value: 'answer', revision: 2 }] }))
      .toMatchObject({ sessionId, roundId, version: 2, answers: [{ blankId, revision: 2 }] });
    expect(parseStudentDraftSnapshotPayload({ sessionId, roundId, version: 2, status: 'editable', answers: [{ blankId: 'bad', value: 'answer', revision: 2 }] })).toBeNull();
    expect(parseStudentDraftChangedPayload({ sessionId, roundId, version: 3, answer: { blankId, value: 'new', revision: 3 }, clientMutationId: mutationId }))
      .toMatchObject({ sessionId, roundId, version: 3 });
    expect(parseStudentDraftLockedPayload({ sessionId, roundId, version: 3, status: 'locked' })).toEqual({ sessionId, roundId, version: 3, status: 'locked' });
    expect(parseStudentDraftLockedPayload({ sessionId, roundId, version: 3, status: 'editable' })).toBeNull();
  });
});
