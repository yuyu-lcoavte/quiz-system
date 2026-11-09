import type { ActivityCodeLookupSummary, CurrentTargetView, ResultView, SessionStateSnapshot, SessionSummary } from './domain.js';
import type { ApiErrorEnvelope } from './errors.js';

export interface ApiSuccess<T> {
  data: T;
  meta?: { requestId: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorEnvelope;

export type ActivityCodeLookupResponse = ApiSuccess<ActivityCodeLookupSummary>;
export type SessionResponse = ApiSuccess<SessionSummary>;
export type SessionStateResponse = ApiSuccess<SessionStateSnapshot>;
export type CurrentTargetResponse = ApiSuccess<CurrentTargetView | null>;
export type ResultsResponse = ApiSuccess<ResultView[]>;
