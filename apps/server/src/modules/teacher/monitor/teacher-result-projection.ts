import type Database from 'better-sqlite3';
import type { RoundPhase, RoundTargetReference, UUID } from '@quiz/contracts/domain';
import type { TeacherAnswerView, TeacherMonitorView, TeacherResultView, TeacherSubmissionView } from '@quiz/contracts';
import { HttpError } from '../../../errors/http-error.js';

interface RoundRow {
  id: string; session_id: string; question_id: string | null; question_group_id: string | null;
  phase: RoundPhase; created_at: string;
}
interface SubmissionRow { id: string; team_id: string; team_name: string; accepted_order: number; received_at: string }
export interface RoundRecord {
  readonly roundId: UUID;
  readonly number: string;
  /** 1-based ordinal among Rounds of the same target (第幾輪). */
  readonly roundNumber: number;
  readonly phase: RoundPhase;
  readonly submissions: TeacherSubmissionView[];
  readonly winnerTeamId: UUID | null;
}
interface AnswerRow { submission_id: string; blank_id: string; label: string | null; value: string }

/**
 * Teacher-only read model over Foundation tables (FR-022–FR-024). Reads canonical Submissions only, never Student drafts.
 * Exposed only under /api/v1/teacher.
 */
export class TeacherResultProjection {
  private readonly session;
  private readonly teams;
  private readonly round;
  private readonly submissions;
  private readonly answers;
  private readonly result;
  private readonly roundsOfTarget;
  private readonly targetNumber;
  private readonly allRounds;

  constructor(database: Database.Database) {
    this.session = database.prepare('SELECT current_round_id FROM sessions WHERE id = ?');
    this.teams = database.prepare('SELECT id, name FROM teams WHERE session_id = ? ORDER BY created_at, id');
    this.round = database.prepare('SELECT id, session_id, question_id, question_group_id, phase, created_at FROM rounds WHERE id = ?');
    this.submissions = database.prepare(`SELECT s.id, s.team_id, t.name AS team_name, s.accepted_order, s.received_at
      FROM submissions s JOIN teams t ON t.id = s.team_id WHERE s.round_id = ? ORDER BY s.accepted_order`);
    this.answers = database.prepare(`SELECT sa.submission_id, sa.blank_id, b.label, sa.value
      FROM submission_answers sa JOIN submissions s ON s.id = sa.submission_id
      JOIN blanks b ON b.id = sa.blank_id JOIN questions q ON q.id = b.question_id
      WHERE s.round_id = ? ORDER BY q.position, b.position`);
    this.result = database.prepare('SELECT winning_submission_id FROM results WHERE round_id = ?');
    this.roundsOfTarget = database.prepare(`SELECT id FROM rounds WHERE session_id = ?
      AND (question_id = ? OR question_group_id = ?) ORDER BY created_at, rowid`);
    this.allRounds = database.prepare(`SELECT id, session_id, question_id, question_group_id, phase, created_at
      FROM rounds WHERE session_id = ? ORDER BY created_at, rowid`);
    this.targetNumber = database.prepare(`SELECT COALESCE(
      (SELECT display_number FROM questions WHERE id = ?), (SELECT label FROM question_groups WHERE id = ?)) AS number`);
  }

  monitor(sessionId: UUID): TeacherMonitorView {
    const current = this.currentRound(sessionId);
    const teams = this.teams.all(sessionId) as { id: string; name: string }[];
    if (!current) {
      return { roundId: null, phase: 'Waiting', teams: teams.map((team) => emptyTeam(team)) };
    }
    const submissions = this.submissionsOf(current.id as UUID);
    const byTeam = new Map(submissions.map((submission) => [submission.teamId, submission]));
    return {
      roundId: current.id as UUID,
      phase: current.phase,
      teams: teams.map((team) => {
        const submission = byTeam.get(team.id as UUID);
        return submission
          ? { teamId: submission.teamId, teamName: team.name, submitted: true, acceptedOrder: submission.acceptedOrder, receivedAt: submission.receivedAt, answers: submission.answers }
          : emptyTeam(team);
      }),
    };
  }

  /** Any Round of this Session; defaults to the current Round. Only Ended Rounds have results. */
  results(sessionId: UUID, roundId?: UUID): TeacherResultView {
    const round = roundId ? this.round.get(roundId) as RoundRow | undefined : this.currentRound(sessionId);
    if (!round || round.session_id !== sessionId) {
      if (!roundId) throw new HttpError(409, 'INVALID_PHASE', 'There is no Round to show results for.');
      throw new HttpError(404, 'TARGET_NOT_FOUND', 'The Round does not exist in this activity.');
    }
    if (round.phase !== 'Ended') throw new HttpError(409, 'INVALID_PHASE', 'Results are available after the Round has ended.');
    const targetId = (round.question_id ?? round.question_group_id) as UUID;
    const target: RoundTargetReference = round.question_id
      ? { kind: 'question', questionId: round.question_id as UUID }
      : { kind: 'questionGroup', questionGroupId: round.question_group_id as UUID };
    const submissions = this.submissionsOf(round.id as UUID);
    const stored = this.result.get(round.id) as { winning_submission_id: string } | undefined;
    // A replaced (older) Round lost its Result row on reopen; the same earliest-accepted rule applies (research.md R10).
    const winnerId = stored?.winning_submission_id ?? submissions[0]?.id;
    const winner = submissions.find((submission) => submission.id === winnerId);
    const rounds = (this.roundsOfTarget.all(sessionId, targetId, targetId) as { id: string }[]).map((row) => row.id);
    return {
      roundId: round.id as UUID,
      target,
      number: (this.targetNumber.get(targetId, targetId) as { number: string | null }).number ?? '',
      roundNumber: rounds.indexOf(round.id) + 1,
      submissions: submissions.map(({ id: _id, ...view }) => view),
      winner: winner ? { teamId: winner.teamId, teamName: winner.teamName, answers: winner.answers } : null,
    };
  }

  /**
   * Every Round of the Session in the order they were created, with submissions and the winner
   * (Ended Rounds only; same rule as `results`). Used by the CSV export.
   */
  rounds(sessionId: UUID): RoundRecord[] {
    const rows = this.allRounds.all(sessionId) as RoundRow[];
    const ordinal = new Map<string, number>();
    return rows.map((round) => {
      const targetId = (round.question_id ?? round.question_group_id) as string;
      const roundNumber = (ordinal.get(targetId) ?? 0) + 1;
      ordinal.set(targetId, roundNumber);
      const submissions = this.submissionsOf(round.id as UUID);
      let winnerTeamId: UUID | null = null;
      if (round.phase === 'Ended') {
        const stored = this.result.get(round.id) as { winning_submission_id: string } | undefined;
        const winnerId = stored?.winning_submission_id ?? submissions[0]?.id;
        winnerTeamId = submissions.find((submission) => submission.id === winnerId)?.teamId ?? null;
      }
      return {
        roundId: round.id as UUID,
        number: (this.targetNumber.get(targetId, targetId) as { number: string | null }).number ?? '',
        roundNumber,
        phase: round.phase,
        submissions: submissions.map(({ id: _id, ...view }) => view),
        winnerTeamId,
      };
    });
  }

  private currentRound(sessionId: UUID): RoundRow | undefined {
    const session = this.session.get(sessionId) as { current_round_id: string | null } | undefined;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'The Session does not exist.');
    return session.current_round_id ? this.round.get(session.current_round_id) as RoundRow | undefined : undefined;
  }

  private submissionsOf(roundId: UUID): (TeacherSubmissionView & { id: string })[] {
    const answers = new Map<string, TeacherAnswerView[]>();
    for (const row of this.answers.all(roundId) as AnswerRow[]) {
      const list = answers.get(row.submission_id) ?? [];
      list.push({ blankId: row.blank_id as UUID, label: row.label, value: row.value });
      answers.set(row.submission_id, list);
    }
    return (this.submissions.all(roundId) as SubmissionRow[]).map((row) => ({
      id: row.id,
      teamId: row.team_id as UUID,
      teamName: row.team_name,
      acceptedOrder: row.accepted_order,
      receivedAt: row.received_at,
      answers: answers.get(row.id) ?? [],
    }));
  }
}

function emptyTeam(team: { id: string; name: string }) {
  return { teamId: team.id as UUID, teamName: team.name, submitted: false, acceptedOrder: null, receivedAt: null, answers: [] };
}
