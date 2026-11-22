import type { RequestHandler } from 'express';
import { parseUUID } from '@quiz/contracts/domain';
import { HttpError } from '../../errors/http-error.js';
import type { TeacherResultProjection } from '../../modules/teacher/monitor/teacher-result-projection.js';

export function createTeacherMonitorController(projection: TeacherResultProjection) {
  const monitor: RequestHandler = (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ data: projection.monitor(request.teacherSessionId!) });
  };

  const results: RequestHandler = (request, response) => {
    const raw = request.query.roundId;
    let roundId;
    if (raw !== undefined) {
      roundId = typeof raw === 'string' ? parseUUID(raw) : null;
      if (!roundId) throw new HttpError(400, 'INVALID_INPUT', 'roundId must be a UUID.');
    }
    response.setHeader('Cache-Control', 'no-store');
    response.json({ data: projection.results(request.teacherSessionId!, roundId ?? undefined) });
  };

  return { monitor, results };
}
