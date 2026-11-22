import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { ActivityService } from '../activity/activity-service.js';
import { createTeacherRepositories } from '../persistence/index.js';
import { DEMO_TARGETS, DEMO_TEAM_COUNT } from './demo-guided-notes.dev.js';

/**
 * DEVELOPMENT ONLY. Creates one demo activity with 第1組/第2組 and the demo questions.
 * Writes no Google Sheets source, so write-back answers NOT_IMPORTED for this activity.
 */
export function seedDemoActivity(
  database: Database.Database,
  options: { nodeEnv: string; now?: () => Date },
): { sessionId: UUID; activityCode: string } {
  if (options.nodeEnv === 'production') {
    throw new Error('teacher:seed-demo is for development only and refuses to run when NODE_ENV=production.');
  }
  const now = options.now ?? (() => new Date());
  const activities = new ActivityService(database, createTeacherRepositories(database), now);
  const repositories = createFoundationRepositories(database);

  return database.transaction(() => {
    const { sessionId, activityCode } = activities.create(DEMO_TEAM_COUNT);
    DEMO_TARGETS.forEach((target, position) => {
      const groupId = target.kind === 'questionGroup' ? randomUUID() as UUID : null;
      if (groupId) repositories.questionGroups.create({ id: groupId, sessionId, label: target.number, position });
      target.questions.forEach((labels, row) => {
        const questionId = randomUUID() as UUID;
        repositories.questions.create({
          id: questionId, sessionId, questionGroupId: groupId, displayNumber: target.number, prompt: null,
          position: groupId ? row : position,
        });
        labels.forEach((label, index) => repositories.blanks.create({ id: randomUUID() as UUID, questionId, label, position: index }));
      });
    });
    return { sessionId, activityCode };
  })();
}
