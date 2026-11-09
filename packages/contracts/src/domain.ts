/** Nominal UUID string; callers obtain one by validating an external string. */
declare const uuidBrand: unique symbol;
export type UUID = string & { readonly [uuidBrand]: true };
export type ISODateTime = string;

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function parseUUID(value: unknown): UUID | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? (value as UUID) : null;
}

export type RoundPhase = 'Waiting' | 'Active' | 'Ended';

export interface Session {
  id: UUID;
  activityCode: string;
  currentRoundId: UUID | null;
  stateVersion: number;
  createdAt: ISODateTime;
}

export interface Question {
  id: UUID;
  sessionId: UUID;
  questionGroupId?: UUID | null;
  displayNumber?: string | null;
  prompt?: string | null;
  position: number;
}

export interface Blank {
  id: UUID;
  questionId: UUID;
  label?: string | null;
  position: number;
}

export interface QuestionGroup {
  id: UUID;
  sessionId: UUID;
  label?: string | null;
  position: number;
}

export interface QuestionView extends Question {
  /** A Question can contain zero or more independently identified blanks. */
  blanks: Blank[];
}

export interface QuestionGroupView extends QuestionGroup {
  /** Cardinality and submission-target validity remain domain validation concerns. */
  questions: QuestionView[];
}

export type RoundTargetReference =
  | { kind: 'question'; questionId: UUID }
  | { kind: 'questionGroup'; questionGroupId: UUID };

interface RoundFields {
  id: UUID;
  sessionId: UUID;
  phase: RoundPhase;
  createdAt: ISODateTime;
  startedAt?: ISODateTime | null;
  endedAt?: ISODateTime | null;
}

/** The union enforces the existing exactly-one Question or QuestionGroup target rule. */
export type Round = RoundFields &
  (
    | { questionId: UUID; questionGroupId?: null }
    | { questionId?: null; questionGroupId: UUID }
  );

export interface Team {
  id: UUID;
  sessionId: UUID;
  name: string;
  createdAt: ISODateTime;
}

export interface Participant {
  id: UUID;
  teamId: UUID;
  displayName?: string | null;
  createdAt: ISODateTime;
}

export interface Submission {
  id: UUID;
  teamId: UUID;
  roundId: UUID;
  receivedAt: ISODateTime;
  /** Stored model field; assignment and interpretation belong to the writing Feature. */
  acceptedOrder: number;
}

export interface SubmissionAnswer {
  submissionId: UUID;
  blankId: UUID;
  value: string;
}

export interface Result {
  id: UUID;
  roundId: UUID;
  winningSubmissionId: UUID;
  createdAt: ISODateTime;
}

export interface SessionSummary {
  sessionId: UUID;
  activityCode?: string;
  phase: RoundPhase;
  currentRoundId: UUID | null;
  stateVersion: number;
}

export interface ActivityCodeLookupSummary {
  sessionId: UUID;
  phase: RoundPhase;
}

export interface ResultView extends Result {}

export type CurrentTargetView =
  | { roundId: UUID; target: { kind: 'question'; question: QuestionView } }
  | { roundId: UUID; target: { kind: 'questionGroup'; questionGroup: QuestionGroupView } };

interface SnapshotFields {
  sessionId: UUID;
  stateVersion: number;
  changedAt: ISODateTime;
}

/** No current Round is represented as Waiting with both currentRoundId and target null. */
export type SessionStateSnapshot = SnapshotFields &
  (
    | { phase: 'Waiting'; currentRoundId: null; target: null }
    | { phase: 'Waiting'; currentRoundId: UUID; target: RoundTargetReference }
    | { phase: 'Active' | 'Ended'; currentRoundId: UUID; target: RoundTargetReference }
  );
