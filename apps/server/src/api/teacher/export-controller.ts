import type { RequestHandler } from 'express';
import type { ActivityRecordService } from '../../modules/teacher/export/activity-record-service.js';

export function createTeacherExportController(records: ActivityRecordService) {
  const csv: RequestHandler = (request, response) => {
    const { filename, body } = records.csv(request.teacherSessionId!);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // Activity codes are [A-Z2-9]{6}, so the filename needs no further escaping.
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(body);
  };
  return { csv };
}
