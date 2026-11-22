import type { RequestHandler } from 'express';
import { parseTeacherImportConfirmRequest, parseTeacherImportPreviewRequest } from '@quiz/contracts';
import { HttpError } from '../../errors/http-error.js';
import type { ActivityService } from '../../modules/teacher/activity/activity-service.js';
import type { GuidedNotesImportService } from '../../modules/teacher/guided-notes/import-service.js';

const invalid = () => new HttpError(400, 'INVALID_INPUT', 'The request body is invalid.');

export function createTeacherImportController(imports: GuidedNotesImportService, activities: ActivityService) {
  const preview: RequestHandler = async (request, response, next) => {
    try {
      const body = parseTeacherImportPreviewRequest(request.body);
      if (!body) throw invalid();
      response.json({ data: await imports.preview(body.url) });
    } catch (error) {
      next(error);
    }
  };

  const confirm: RequestHandler = async (request, response, next) => {
    try {
      const body = parseTeacherImportConfirmRequest(request.body);
      if (!body) throw invalid();
      await imports.confirm(request.teacherSessionId!, body.url, body.previewDigest);
      response.status(201).json({ data: activities.detail(request.teacherSessionId!) });
    } catch (error) {
      next(error);
    }
  };

  return { preview, confirm };
}
