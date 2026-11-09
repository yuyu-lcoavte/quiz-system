import {
  parseUUID,
  type Blank,
  type Participant,
  type Question,
  type QuestionGroup,
  type Result,
  type Round,
  type Session,
  type Submission,
  type SubmissionAnswer,
  type Team,
  type UUID,
} from '@quiz/contracts/domain';

export function uuid(value: string): UUID {
  const parsed = parseUUID(value);
  if (!parsed) throw new Error('Persisted identifier is not a UUID.');
  return parsed;
}

export interface SessionRow { id: string; activity_code: string; current_round_id: string | null; state_version: number; created_at: string }
export interface QuestionGroupRow { id: string; session_id: string; label: string | null; position: number }
export interface QuestionRow { id: string; session_id: string; question_group_id: string | null; display_number: string | null; prompt: string | null; position: number }
export interface BlankRow { id: string; question_id: string; label: string | null; position: number }
export interface TeamRow { id: string; session_id: string; name: string; created_at: string }
export interface ParticipantRow { id: string; team_id: string; display_name: string | null; created_at: string }
export interface RoundRow { id: string; session_id: string; question_id: string | null; question_group_id: string | null; phase: 'Waiting' | 'Active' | 'Ended'; created_at: string; started_at: string | null; ended_at: string | null }
export interface SubmissionRow { id: string; team_id: string; round_id: string; received_at: string; accepted_order: number }
export interface SubmissionAnswerRow { submission_id: string; blank_id: string; value: string }
export interface ResultRow { id: string; round_id: string; winning_submission_id: string; created_at: string }

export const mapSession = (row: SessionRow): Session => ({ id: uuid(row.id), activityCode: row.activity_code, currentRoundId: row.current_round_id ? uuid(row.current_round_id) : null, stateVersion: row.state_version, createdAt: row.created_at });
export const mapQuestionGroup = (row: QuestionGroupRow): QuestionGroup => ({ id: uuid(row.id), sessionId: uuid(row.session_id), label: row.label, position: row.position });
export const mapQuestion = (row: QuestionRow): Question => ({ id: uuid(row.id), sessionId: uuid(row.session_id), questionGroupId: row.question_group_id ? uuid(row.question_group_id) : null, displayNumber: row.display_number, prompt: row.prompt, position: row.position });
export const mapBlank = (row: BlankRow): Blank => ({ id: uuid(row.id), questionId: uuid(row.question_id), label: row.label, position: row.position });
export const mapTeam = (row: TeamRow): Team => ({ id: uuid(row.id), sessionId: uuid(row.session_id), name: row.name, createdAt: row.created_at });
export const mapParticipant = (row: ParticipantRow): Participant => ({ id: uuid(row.id), teamId: uuid(row.team_id), displayName: row.display_name, createdAt: row.created_at });
export const mapRound = (row: RoundRow): Round => {
  const fields = { id: uuid(row.id), sessionId: uuid(row.session_id), phase: row.phase, createdAt: row.created_at, startedAt: row.started_at, endedAt: row.ended_at };
  return row.question_id
    ? { ...fields, questionId: uuid(row.question_id), questionGroupId: null }
    : { ...fields, questionId: null, questionGroupId: uuid(row.question_group_id!) };
};
export const mapSubmission = (row: SubmissionRow): Submission => ({ id: uuid(row.id), teamId: uuid(row.team_id), roundId: uuid(row.round_id), receivedAt: row.received_at, acceptedOrder: row.accepted_order });
export const mapSubmissionAnswer = (row: SubmissionAnswerRow): SubmissionAnswer => ({ submissionId: uuid(row.submission_id), blankId: uuid(row.blank_id), value: row.value });
export const mapResult = (row: ResultRow): Result => ({ id: uuid(row.id), roundId: uuid(row.round_id), winningSubmissionId: uuid(row.winning_submission_id), createdAt: row.created_at });
