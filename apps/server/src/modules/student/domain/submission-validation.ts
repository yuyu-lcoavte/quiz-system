import type { UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';

export interface SubmittedAnswer { blankId: UUID; value: string; }

export function validateSubmissionCompleteness(required: UUID[], draft: SubmittedAnswer[], confirmation: SubmittedAnswer[]): void {
  const expected = new Set(required);
  if (expected.size === 0 || draft.length !== expected.size || draft.some(a => !expected.has(a.blankId) || !a.value.trim())) {
    throw new HttpError(400, 'INVALID_INPUT', 'Every required Blank needs a non-whitespace draft answer.');
  }
  if (confirmation.length !== expected.size || new Set(confirmation.map(a => a.blankId)).size !== expected.size || confirmation.some(a => !expected.has(a.blankId))) {
    throw new HttpError(400, 'INVALID_INPUT', 'Submission must confirm every target Blank exactly once.');
  }
  const values = new Map(draft.map(a => [a.blankId, a.value]));
  if (confirmation.some(a => values.get(a.blankId) !== a.value)) throw new HttpError(409, 'STALE_STATE', 'The draft changed; reload it before submitting.');
}

export function requireTeamLeader(leaderId: UUID | undefined, participantId: UUID): void {
  if (leaderId !== participantId) throw new HttpError(403, 'FORBIDDEN', 'Only the current Team leader can submit.');
}
