import { parseUUID, type Blank, type Participant, type Question, type QuestionGroup, type Result, type Session, type Submission, type SubmissionAnswer, type Team, type UUID } from '@quiz/contracts/domain';
import { HttpError } from '../../../errors/http-error.js';

function invalid(message: string): never {
  throw new HttpError(400, 'INVALID_INPUT', message);
}

export function validateUUID(value: unknown, label: string): asserts value is UUID {
  if (!parseUUID(value)) invalid(`${label} must be a UUID.`);
}

function requirePosition(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a non-negative integer.`);
}

export function validateQuestion(value: Question): void {
  validateUUID(value.id, 'Question id');
  validateUUID(value.sessionId, 'Question sessionId');
  if (value.questionGroupId != null) validateUUID(value.questionGroupId, 'Question questionGroupId');
  requirePosition(value.position, 'Question position');
}

export function validateBlank(value: Blank): void {
  validateUUID(value.id, 'Blank id');
  validateUUID(value.questionId, 'Blank questionId');
  requirePosition(value.position, 'Blank position');
}

export function validateQuestionGroup(value: QuestionGroup): void {
  validateUUID(value.id, 'QuestionGroup id');
  validateUUID(value.sessionId, 'QuestionGroup sessionId');
  requirePosition(value.position, 'QuestionGroup position');
  // A group may be persisted while incomplete; target validation is separate.
}

export function validateRoundTargetShape(
  questionId: unknown,
  questionGroupId: unknown,
): void {
  const hasQuestion = questionId !== null && questionId !== undefined;
  const hasQuestionGroup = questionGroupId !== null && questionGroupId !== undefined;
  if (hasQuestion === hasQuestionGroup) {
    invalid('A Round must target exactly one Question or QuestionGroup.');
  }
  if (hasQuestion) validateUUID(questionId, 'Round questionId');
  if (hasQuestionGroup) validateUUID(questionGroupId, 'Round questionGroupId');
}

export function validateSession(value: Session): void {
  validateUUID(value.id, 'Session id');
  if (!value.activityCode.trim()) invalid('Session activityCode is required.');
  if (!Number.isSafeInteger(value.stateVersion) || value.stateVersion < 0) invalid('Session stateVersion must be a non-negative integer.');
}

export function validateTeam(value: Team): void {
  validateUUID(value.id, 'Team id');
  validateUUID(value.sessionId, 'Team sessionId');
  if (!value.name.trim()) invalid('Team name is required.');
}

export function validateParticipant(value: Participant): void {
  validateUUID(value.id, 'Participant id');
  validateUUID(value.teamId, 'Participant teamId');
}

export function validateSubmission(value: Submission): void {
  validateUUID(value.id, 'Submission id');
  validateUUID(value.teamId, 'Submission teamId');
  validateUUID(value.roundId, 'Submission roundId');
  if (!Number.isSafeInteger(value.acceptedOrder)) invalid('Submission acceptedOrder must be a safe integer from the trusted acceptance service.');
}

export function validateSubmissionAnswer(value: SubmissionAnswer): void {
  validateUUID(value.submissionId, 'SubmissionAnswer submissionId');
  validateUUID(value.blankId, 'SubmissionAnswer blankId');
}

export function validateResult(value: Result): void {
  validateUUID(value.id, 'Result id');
  validateUUID(value.roundId, 'Result roundId');
  validateUUID(value.winningSubmissionId, 'Result winningSubmissionId');
}

export function validateSameSession(firstSessionId: UUID | string, secondSessionId: UUID | string, relation: string): void {
  if (firstSessionId !== secondSessionId) invalid(`${relation} must belong to the same Session.`);
}

export function validateQuestionGroupTarget(questionCount: number): void {
  if (!Number.isSafeInteger(questionCount) || questionCount < 1) {
    invalid('An empty QuestionGroup cannot be a Round target.');
  }
}

export function validateBlankTargetMembership(isMember: boolean): void {
  if (!isMember) invalid('The Blank does not belong to the Round target.');
}

export function validateResultWinner(roundId: UUID | string, submissionRoundId: UUID | string | null): void {
  if (submissionRoundId !== roundId) invalid('The winning Submission must belong to the Result Round.');
}
