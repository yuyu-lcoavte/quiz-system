import type Database from 'better-sqlite3';
import type { UUID } from '@quiz/contracts/domain';
import type { TeacherAnswerView } from '@quiz/contracts';
import { HttpError } from '../../../errors/http-error.js';
import type { TeacherResultProjection } from '../monitor/teacher-result-projection.js';
import { formatTaipeiTime, writeCsv } from './csv-writer.js';

export const ACTIVITY_RECORD_HEADER = ['題號', '第幾輪', '組別', '答案', '順位', '是否勝出', '送出時間'] as const;

/** Answers joined with their markers, e.g. 「（1）CPU；（2）OS」; an unmarked blank is its answer alone. */
export function joinAnswers(answers: readonly TeacherAnswerView[]): string {
  return answers.map((answer) => `${answer.label ?? ''}${answer.value}`).join('；');
}

/** Activity record CSV (FR-037/FR-038): one row per Round × Team; non-submitters have empty answer/order/time and 否. */
export class ActivityRecordService {
  private readonly session;
  private readonly teams;

  constructor(database: Database.Database, private readonly projection: TeacherResultProjection) {
    this.session = database.prepare('SELECT activity_code FROM sessions WHERE id = ?');
    this.teams = database.prepare('SELECT id, name FROM teams WHERE session_id = ? ORDER BY created_at, id');
  }

  rows(sessionId: UUID): string[][] {
    const teams = this.teams.all(sessionId) as { id: string; name: string }[];
    return this.projection.rounds(sessionId).flatMap((round) => {
      const byTeam = new Map(round.submissions.map((submission) => [submission.teamId as string, submission]));
      return teams.map((team) => {
        const submission = byTeam.get(team.id);
        return [
          round.number,
          String(round.roundNumber),
          team.name,
          submission ? joinAnswers(submission.answers) : '',
          submission ? String(submission.acceptedOrder) : '',
          round.winnerTeamId === team.id ? '是' : '否',
          formatTaipeiTime(submission?.receivedAt ?? null),
        ];
      });
    });
  }

  csv(sessionId: UUID): { filename: string; body: string } {
    const session = this.session.get(sessionId) as { activity_code: string } | undefined;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    return { filename: `activity-${session.activity_code}.csv`, body: writeCsv(ACTIVITY_RECORD_HEADER, this.rows(sessionId)) };
  }
}
