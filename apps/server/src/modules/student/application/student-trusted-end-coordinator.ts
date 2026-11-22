import type { SessionStateSnapshot, UUID } from '@quiz/contracts/domain';
import type { ActorContext } from '@quiz/contracts/identity';
import { HttpError } from '../../../errors/http-error.js';
import type { StudentWinnerResolver } from './winner-resolver.js';
import type { FoundationLifecycleEndPort } from '../../sessions/application/session-lifecycle-service.js';

export interface StudentEndRoundInput {
  readonly sessionId: UUID;
  readonly roundId: UUID;
  readonly expectedStateVersion: number;
  readonly requestId: string;
}

/** Preserve the internal import path while the canonical Port remains Foundation-owned. */
export type { FoundationLifecycleEndPort } from '../../sessions/application/session-lifecycle-service.js';

/** Internal adapter composed by the server; trusted Teacher issuance belongs to Teacher Feature. */
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
