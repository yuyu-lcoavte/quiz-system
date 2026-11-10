import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ActorContext } from '@quiz/contracts/identity';
import type { UUID } from '@quiz/contracts/domain';
import type { StudentDraftLockedPayload } from '@quiz/contracts';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { createStudentRepositories } from '../persistence/index.js';
import { HttpError } from '../../../errors/http-error.js';
import { requireTeamLeader, validateSubmissionCompleteness, type SubmittedAnswer } from '../domain/submission-validation.js';

export class SubmissionService {
  constructor(private readonly db: Database.Database, private readonly publish: (teamId: UUID, lock: StudentDraftLockedPayload) => void = () => {}) {}

  submit(actor: ActorContext, sessionId: UUID, roundId: UUID, confirmation: SubmittedAnswer[]) {
    if (this.db.inTransaction) throw new Error('Submission must own its transaction to publish after commit.');
    const committed = this.db.transaction(() => {
      const foundation = createFoundationRepositories(this.db), student = createStudentRepositories(this.db);
      const participant = actor.actorKind === 'participant' ? foundation.participants.findById(actor.actorId as UUID) : null;
      if (!participant || actor.sessionId !== sessionId || actor.teamId !== participant.teamId || !foundation.teams.listBySession(sessionId).some(t => t.id === participant.teamId)) throw new HttpError(403, 'FORBIDDEN', 'Invalid Student membership.');
      const teamId = participant.teamId;
      requireTeamLeader(student.teamLeaders.findByTeamId(teamId)?.participantId, participant.id);
      const session = foundation.sessions.findById(sessionId), round = foundation.rounds.findById(roundId);
      if (!session || session.currentRoundId !== roundId || !round || round.sessionId !== sessionId || round.phase !== 'Active') throw new HttpError(409, 'INVALID_PHASE', 'The current Round must be Active.');
      if (this.db.prepare('SELECT 1 FROM submissions WHERE team_id=? AND round_id=?').get(teamId, roundId)) throw new HttpError(409, 'DUPLICATE_SUBMISSION', 'This Team already submitted this Round.');
      const questions = this.db.prepare('SELECT q.id,COUNT(b.id) blank_count FROM questions q LEFT JOIN blanks b ON b.question_id=q.id WHERE q.session_id=? AND (q.id=? OR (? IS NOT NULL AND q.question_group_id=?)) GROUP BY q.id').all(sessionId, round.questionId ?? null, round.questionGroupId ?? null, round.questionGroupId ?? null) as { id: string; blank_count: number }[];
      if (!questions.length || questions.every(q => q.blank_count === 0)) throw new HttpError(400, 'INVALID_INPUT', 'A target without answerable Blanks is not submittable.');
      const required = this.db.prepare('SELECT b.id FROM blanks b JOIN questions q ON q.id=b.question_id WHERE q.session_id=? AND (q.id=? OR (? IS NOT NULL AND q.question_group_id=?))').all(sessionId, round.questionId ?? null, round.questionGroupId ?? null, round.questionGroupId ?? null) as { id: UUID }[];
      const draft = student.drafts.find(teamId, roundId);
      if (!draft || draft.status !== 'editable') throw new HttpError(409, 'STALE_STATE', 'An editable persisted draft is required.');
      const answers = student.draftAnswers.list(teamId, roundId);
      validateSubmissionCompleteness(required.map(b => b.id), answers, confirmation);
      const acceptedOrder = (this.db.prepare('SELECT COALESCE(MAX(accepted_order),0)+1 next FROM submissions WHERE round_id=?').get(roundId) as { next: number }).next;
      const submissionId = randomUUID() as UUID, now = new Date().toISOString();
      foundation.submissions.create({ id: submissionId, teamId, roundId, receivedAt: now, acceptedOrder });
      for (const answer of answers) foundation.submissionAnswers.create({ submissionId, blankId: answer.blankId, value: answer.value });
      const version = student.drafts.incrementVersion(teamId, roundId, now);
      if (version === null || !student.drafts.lock(teamId, roundId, now)) throw new HttpError(409, 'STALE_STATE', 'The draft could not be locked.');
      return { teamId, submissionId, acceptedOrder, lock: { sessionId, roundId, version, status: 'locked' as const } };
    }).immediate();
    try { this.publish(committed.teamId, committed.lock); } catch { /* Committed state is recovered through a snapshot if delivery fails. */ }
    return { submissionId: committed.submissionId, acceptedOrder: committed.acceptedOrder, draftStatus: 'locked' as const };
  }
}
