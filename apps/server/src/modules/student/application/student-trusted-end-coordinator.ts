import type { Result, SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import { HttpError } from '../../../errors/http-error.js';
import type { StudentWinnerResolver } from './winner-resolver.js';

export interface StudentEndRoundInput {
  readonly sessionId: UUID;
  readonly roundId: UUID;
  readonly expectedStateVersion: number;
  readonly requestId: string;
}

/** Foundation owns the outer immediate transaction and publishes after it commits. */
export interface FoundationLifecycleEndPort {
  endRoundWithWinnerResolver(
    input: StudentEndRoundInput,
    resolveWinner: (roundId: UUID) => Result | null,
  ): SessionStateSnapshot;
}

/** Internal adapter for trusted server callers. Production wiring awaits T004 and T044. */
export class StudentTrustedEndCoordinator {
  constructor(
    private readonly lifecycle: FoundationLifecycleEndPort,
    private readonly winner: Pick<StudentWinnerResolver, 'resolveWinnerInTransaction'>,
  ) {}

  endRound(input: StudentEndRoundInput, actor: ActorContext | null): SessionStateSnapshot {
    if (actor?.actorKind !== 'teacher') {
      throw new HttpError(401, 'UNAUTHENTICATED', 'A trusted Teacher identity is required.');
    }
    if (actor.sessionId !== input.sessionId || !actor.permissions.includes('round:end')) {
      throw new HttpError(403, 'FORBIDDEN', 'The Teacher cannot end this Session Round.');
    }
    return this.lifecycle.endRoundWithWinnerResolver(input, roundId => this.winner.resolveWinnerInTransaction(roundId));
  }
}
