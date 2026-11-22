import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import { seedDemoActivity } from '../../apps/server/src/modules/teacher/dev/seed-demo.js';
import { TargetCatalog } from '../../apps/server/src/modules/teacher/rounds/target-catalog.js';
import { createFoundationTestContext } from '../helpers/foundation.js';

const TEACHER_SRC = resolve(process.cwd(), 'apps/server/src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('teacher:seed-demo (development only)', () => {
  it('creates one activity with 第1組/第2組 and the question-group template structure', () => {
    const { database, repositories } = createFoundationTestContext();
    const { sessionId, activityCode } = seedDemoActivity(database, { nodeEnv: 'development' });
    expect(activityCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect((database.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n).toBe(1);
    expect(repositories.teams.listBySession(sessionId as UUID).map((team) => team.name)).toEqual(['第1組', '第2組']);

    const targets = new TargetCatalog(database).targets(sessionId as UUID);
    expect(targets.map((t) => [t.number, t.kind, t.questionCount, t.blankCount, t.answerable, t.status])).toEqual([
      ['1', 'questionGroup', 2, 2, true, 'NotOpened'],
      ['2', 'questionGroup', 2, 2, true, 'NotOpened'],
      ['3', 'question', 1, 1, true, 'NotOpened'],
      ['4', 'question', 1, 1, true, 'NotOpened'],
    ]);
    const groupLabels = database.prepare(`SELECT b.label FROM blanks b JOIN questions q ON q.id = b.question_id
      JOIN question_groups g ON g.id = q.question_group_id WHERE g.label = '1' ORDER BY q.position`).all() as { label: string }[];
    expect(groupLabels.map((row) => row.label)).toEqual(['（1）', '（2）']);
  });

  it('writes no Google Sheets source or blank-cell mapping', () => {
    const { database } = createFoundationTestContext();
    seedDemoActivity(database, { nodeEnv: 'development' });
    expect((database.prepare('SELECT COUNT(*) AS n FROM teacher_sheet_sources').get() as { n: number }).n).toBe(0);
    expect((database.prepare('SELECT COUNT(*) AS n FROM teacher_blank_cells').get() as { n: number }).n).toBe(0);
  });

  it('refuses to run in production', () => {
    const { database } = createFoundationTestContext();
    expect(() => seedDemoActivity(database, { nodeEnv: 'production' })).toThrow(/production/);
    expect((database.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
  });

  it('is never imported by production Teacher code (only dev/ and scripts/seed-demo.ts)', () => {
    const allowed = new Set(['modules/teacher/scripts/seed-demo.ts']);
    const offenders = sourceFiles(TEACHER_SRC)
      .map((path) => relative(TEACHER_SRC, path).replaceAll('\\', '/'))
      .filter((path) => !path.startsWith('modules/teacher/dev/') && !allowed.has(path))
      .filter((path) => /from\s+['"][^'"]*\/dev\/[^'"]*['"]/.test(readFileSync(join(TEACHER_SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('marks the demo data file as development only', () => {
    const text = readFileSync(join(TEACHER_SRC, 'modules/teacher/dev/demo-guided-notes.dev.ts'), 'utf8');
    expect(text).toMatch(/DEVELOPMENT ONLY/);
  });
});
