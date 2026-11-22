import type { RequestHandler } from 'express';
import { parseTeacherCreateSessionRequest } from '@quiz/contracts';
import { HttpError } from '../../errors/http-error.js';
import type { ActivityService } from '../../modules/teacher/activity/activity-service.js';

export function createTeacherActivityController(activities: ActivityService) {
  const list: RequestHandler = (_request, response) => {
    response.json({ data: activities.list() });
  };

  const create: RequestHandler = (request, response) => {
    const body = parseTeacherCreateSessionRequest(request.body);
    if (!body) throw new HttpError(400, 'INVALID_INPUT', 'teamCount must be an integer from 1 to 20.');
    response.status(201).json({ data: activities.create(body.teamCount) });
  };

  const detail: RequestHandler = (request, response) => {
    response.json({ data: activities.detail(request.teacherSessionId!) });
  };

  return { list, create, detail };
}
