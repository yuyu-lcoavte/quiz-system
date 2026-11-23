import type { RequestHandler } from 'express';
import { parseTeacherWriteBackConfirmRequest } from '@quiz/contracts';
import { HttpError } from '../../errors/http-error.js';
import type { WriteBackService } from '../../modules/teacher/write-back/write-back-service.js';

export function createTeacherWriteBackController(writeBack: WriteBackService) {
  const preview: RequestHandler = async (request, response, next) => {
    try {
      response.setHeader('Cache-Control', 'no-store');
      response.json({ data: await writeBack.preview(request.teacherSessionId!) });
    } catch (error) {
      next(error);
    }
  };

  const confirm: RequestHandler = async (request, response, next) => {
    try {
      const body = parseTeacherWriteBackConfirmRequest(request.body);
      if (!body) throw new HttpError(400, 'INVALID_INPUT', 'planDigest is required.');
      response.json({ data: await writeBack.confirm(request.teacherSessionId!, body.planDigest) });
    } catch (error) {
      next(error);
    }
  };

  return { preview, confirm };
}
