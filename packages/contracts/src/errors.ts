export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_ACTIVITY_CODE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SESSION_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'INVALID_PHASE'
  | 'DUPLICATE_SUBMISSION'
  | 'STALE_STATE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ApiErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: ApiError;
  meta?: { requestId: string };
}
