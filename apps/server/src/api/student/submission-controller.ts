import type { RequestHandler } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import type { SubmissionService } from '../../modules/student/application/submission-service.js';
import { HttpError } from '../../errors/http-error.js';

export function createSubmissionController(service: SubmissionService): RequestHandler {
  return (req, res, next) => { try {
    const sessionId = parseUUID(req.params.sessionId), roundId = parseUUID(req.params.roundId);
    if (!sessionId || !roundId) throw new HttpError(400, 'INVALID_INPUT', 'Invalid Session or Round.');
    const body = req.body;
    if (!body || Object.keys(body).length !== 1 || !Array.isArray(body.answers)) throw new HttpError(400, 'INVALID_INPUT', 'Only answer confirmation is accepted.');
    const answers = body.answers.map((a: unknown) => {
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid answer.');
      const record = a as Record<string, unknown>, blankId = parseUUID(record.blankId);
      if (Object.keys(record).length !== 2 || !blankId || typeof record.value !== 'string') throw new HttpError(400, 'INVALID_INPUT', 'Invalid answer.');
      return { blankId, value: record.value };
    });
    if (!req.actorContext) throw new HttpError(401, 'UNAUTHENTICATED', 'Student identity required.');
    res.json({ data: service.submit(req.actorContext, sessionId, roundId, answers) });
  } catch (error) { next(error); } };
}
