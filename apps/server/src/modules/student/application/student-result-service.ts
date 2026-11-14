import type Database from 'better-sqlite3';
import type { ActorContext } from '@quiz/contracts/identity';
import type { UUID } from '@quiz/contracts/domain';
import { createFoundationRepositories } from '../../../persistence/repositories/index.js';
import { HttpError } from '../../../errors/http-error.js';

export class StudentResultService {
  constructor(private readonly database: Database.Database) {}

  get(actor: ActorContext, sessionId: UUID, roundId: UUID) {
    return this.database.transaction(() => {
      const repositories = createFoundationRepositories(this.database);
      const participant = actor.actorKind === 'participant' ? repositories.participants.findById(actor.actorId as UUID) : null;
      const teams = repositories.teams.listBySession(sessionId);
      if (!participant || actor.sessionId !== sessionId || actor.teamId !== participant.teamId || !teams.some(t => t.id === participant.teamId)) throw new HttpError(403, 'FORBIDDEN', 'Session membership is required.');
      const session = repositories.sessions.findById(sessionId), round = repositories.rounds.findById(roundId);
      if (!session || !round || round.sessionId !== sessionId || session.currentRoundId !== roundId || round.phase !== 'Ended') throw new HttpError(403, 'FORBIDDEN', 'Results are available only for the current Ended Round.');
      const result = repositories.results.findByRound(roundId);
      if (!result) return { roundId, winner: null };
      const submission = repositories.submissions.findById(result.winningSubmissionId);
      const team = teams.find(t => t.id === submission?.teamId);
      if (!submission || submission.roundId !== roundId || !team) throw new Error('Persisted result integrity failure.');
      const questions = round.questionId ? [repositories.questions.findById(round.questionId)!] : repositories.questions.listByGroup(round.questionGroupId!);
      const labels = new Map(questions.flatMap(q => q.blanks.map(blank => [blank.id, blank.label ?? null] as const)));
      const answers = repositories.submissionAnswers.listBySubmission(submission.id).map(answer => ({ blankId: answer.blankId, label: labels.get(answer.blankId) ?? null, value: answer.value }));
      return { roundId, winner: { teamId: team.id, teamName: team.name, answers } };
    })();
  }
}
