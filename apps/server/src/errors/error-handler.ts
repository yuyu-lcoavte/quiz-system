import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from './http-error.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'TARGET_NOT_FOUND', 'The requested resource was not found.'));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const normalized =
    error instanceof HttpError
      ? error
      : new HttpError(500, 'INTERNAL_ERROR', 'An unexpected internal error occurred.');

  response.status(normalized.status).json({
    error: normalized.toApiError(),
    meta: { requestId: randomUUID() },
  });
};
