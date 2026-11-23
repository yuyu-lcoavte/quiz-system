import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { UUID } from '@quiz/contracts/domain';
import {
  createActivity,
  createTeacherTestServer,
  joinStudent,
  loginAsTeacher,
  seedQuestionGroupTargets,
  submitAnswers,
  teacherApi,
} from '../helpers/teacher.js';

const BOM = '﻿';
const HEADER = '題號,第幾輪,組別,答案,順位,是否勝出,送出時間';

function parse(text: string) {
  expect(text.startsWith(BOM)).toBe(true);
  expect(text.endsWith('\r\n')).toBe(true);
  return text.slice(1).split('\r\n').filter(Boolean).map((line) => line.split(','));
}

async function setup() {
  const server = createTeacherTestServer({ withStudents: true });
  const auth = await loginAsTeacher(server);
  const api = teacherApi(server, auth);
  const { sessionId, activityCode } = await createActivity(server, auth, 3);
  const targets = seedQuestionGroupTargets(server, sessionId);
  const base = `/sessions/${sessionId}`;
  const version = async () => (await api.get(base)).body.data.state.stateVersion as number;
  const teams = (await api.get(base)).body.data.teams as { teamId: UUID }[];
  const students = await Promise.all(teams.map((team, index) => joinStudent(server, sessionId, team.teamId, `S${index}`)));
  const [q1, q2] = targets.group1Questions;
  const play = async (target: object, plays: [number, Record<string, string>][]) => {
    await api.post(`${base}/rounds/select`, { target, expectedStateVersion: await version() });
    const roundId = (await api.post(`${base}/rounds/start`, { expectedStateVersion: await version() })).body.data.currentRoundId as UUID;
    for (const [team, answers] of plays) expect((await submitAnswers(server, sessionId, roundId, students[team], answers)).status).toBe(200);
    await api.post(`${base}/rounds/end`, { expectedStateVersion: await version() });
  };
  const group = { kind: 'questionGroup', questionGroupId: targets.group1 };
  const groupAnswers = (a: string, b: string) => ({ [targets.blanks[q1][0]]: a, [targets.blanks[q2][0]]: b });
  const exportCsv = () => api.get(`${base}/export.csv`);
  return { server, api, base, activityCode, targets, group, groupAnswers, play, exportCsv };
}

describe('Activity record CSV export', () => {
  it('returns one row per Round × Team with the agreed columns and a download filename', async () => {
    const f = await setup();
    await f.play(f.group, [[1, f.groupAnswers('CPU', 'OS')], [0, f.groupAnswers('GPU', 'RAM')]]);
    await f.play({ kind: 'question', questionId: f.targets.question3 }, []);
    const response = await f.exportCsv();
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(response.headers['content-disposition']).toBe(`attachment; filename="activity-${f.activityCode}.csv"`);
    const [header, ...rows] = parse(response.text);
    expect(header.join(',')).toBe(HEADER);
    expect(rows).toHaveLength(2 * 3);
    const groupRows = rows.filter((row) => row[0] === '1');
    expect(groupRows.map((row) => [row[1], row[2], row[3], row[4], row[5]])).toEqual([
      ['1', '第1組', '（1）GPU；（2）RAM', '2', '否'],
      ['1', '第2組', '（1）CPU；（2）OS', '1', '是'],
      ['1', '第3組', '', '', '否'],
    ]);
    expect(groupRows[1][6]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(groupRows[2][6]).toBe('');
    expect(rows.filter((row) => row[0] === '3').every((row) => row[3] === '' && row[5] === '否')).toBe(true);
  });

  it('lists a reopened target once per Round with different 第幾輪', async () => {
    const f = await setup();
    const blank = f.targets.blanks[f.targets.question3][0];
    await f.play({ kind: 'question', questionId: f.targets.question3 }, [[2, { [blank]: 'first' }]]);
    await f.play({ kind: 'question', questionId: f.targets.question3 }, [[0, { [blank]: 'second' }]]);
    const [, ...rows] = parse((await f.exportCsv()).text);
    const winners = rows.filter((row) => row[5] === '是').map((row) => [row[1], row[2], row[3]]);
    expect(winners).toEqual([['1', '第3組', 'first'], ['2', '第1組', 'second']]);
    expect(rows.map((row) => row[1])).toEqual(['1', '1', '1', '2', '2', '2']);
  });

  it('exports only the header when no Round exists yet', async () => {
    const f = await setup();
    const rows = parse((await f.exportCsv()).text);
    expect(rows).toEqual([HEADER.split(',')]);
  });

  it('requires Teacher login', async () => {
    const f = await setup();
    expect((await request(f.server.app).get(`/api/v1/teacher${f.base}/export.csv`)).status).toBe(401);
  });
});
