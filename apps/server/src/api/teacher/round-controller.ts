import type { RequestHandler } from 'express';
import { parseTeacherExpectedVersionRequest, parseTeacherSelectTargetRequest } from '@quiz/contracts';
import { HttpError } from '../../errors/http-error.js';
import type { RoundControlService } from '../../modules/teacher/rounds/round-control-service.js';

const invalid = () => new HttpError(400, 'INVALID_INPUT', 'The request body is invalid.');

/** All commands return the committed SessionStateSnapshot; client-sent winner/order fields are ignored. */
export function createTeacherRoundController(rounds: RoundControlService) {
  const select: RequestHandler = (request, response) => {
    const body = parseTeacherSelectTargetRequest(request.body);
    if (!body) throw invalid();
    response.json({ data: rounds.select(request.teacherSessionId!, body.target, body.expectedStateVersion) });
  };

  const next: RequestHandler = (request, response) => {
    const body = parseTeacherExpectedVersionRequest(request.body);
    if (!body) throw invalid();
    response.json({ data: rounds.next(request.teacherSessionId!, body.expectedStateVersion) });
  };

  const start: RequestHandler = (request, response) => {
    const body = parseTeacherExpectedVersionRequest(request.body);
    if (!body) throw invalid();
    response.json({ data: rounds.start(request.teacherSessionId!, body.expectedStateVersion) });
  };

  const end: RequestHandler = (request, response) => {
    const body = parseTeacherExpectedVersionRequest(request.body);
    if (!body) throw invalid();
    response.json({ data: rounds.end(request.teacherSessionId!, body.expectedStateVersion, request.teacherActor!) });
  };

  return { select, next, start, end };
}
