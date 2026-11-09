import type { Request, RequestHandler } from 'express';

export type RequestValidator = (request: Request) => void | Promise<void>;

export function validateRequest(validator: RequestValidator): RequestHandler {
  return (request, _response, next) => {
    Promise.resolve()
      .then(() => validator(request))
      .then(() => next())
      .catch(next);
  };
}
