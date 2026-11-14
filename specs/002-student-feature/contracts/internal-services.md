# Student Internal End Contract

Teacher provides the trusted End command. Student selects the winner and Foundation owns End/Result persistence and state publication. The production connection and Teacher authorization remain pending T004.

## Foundation ActorContext Permission Baseline

Foundation currently defines `ActorContext.permissions` as `readonly string[]`. Its existing implemented read capabilities are:

- `session:read`
- `session:watch`
- `target:preview`
- `target:read`
- `results:read`

The proposed `round:end` capability belongs to a server-created Teacher context scoped to the Session. Production issuance and the internal port require T004 review.

Use the canonical Foundation `ActorContext` directly:

```ts
type TeacherScopedActorContext = ActorContext & {
  actorKind: 'teacher';
  sessionId: UUID;
};
```

It is produced by trusted Teacher authentication middleware, never request JSON.

## Single Teacher End Interface with Student Winner Resolver

The Student adapter and its scoped authorization checks are implemented in `student-trusted-end-coordinator.ts`. The tests inject a local port that holds an outer immediate transaction while invoking the existing resolver and Foundation persistence primitive. T004 and T044 cover the production port, authorization and wiring.

Teacher calls exactly one trusted internal service. It does not invoke the Foundation lifecycle service and Student resolver as separate operations.

```ts
interface EndRoundInput {
  sessionId: UUID;
  roundId: UUID;
  expectedStateVersion: number;
  requestId: string;
}

interface StudentTrustedEndCoordinator {
  endRound(
    input: EndRoundInput,
    actor: TeacherScopedActorContext,
  ): SessionStateSnapshot; // synchronous; transaction work completes before return
}

type WinnerResolver = (roundId: UUID) => Result | null; // synchronous; never return/await a Promise

interface FoundationLifecycleEndPort {
  endRoundWithWinnerResolver(
    input: EndRoundInput,
    resolveWinner: WinnerResolver,
  ): SessionStateSnapshot; // synchronous; commits before returning
}

interface StudentWinnerResolver {
  resolveWinnerInTransaction(roundId: UUID): Result | null; // synchronous database reads only
}
```

`StudentTrustedEndCoordinator.endRound()` is a synchronous in-process call. It checks `actor.actorKind === 'teacher'`, matching `sessionId`, and the proposed `round:end` capability. It then calls the injected `FoundationLifecycleEndPort` once, passing the Student resolver callback. The Teacher UI sends no winning Submission ID and receives only the committed state snapshot. The callback is synchronous and returns the canonical Foundation `Result` candidate, or `null` when no Submission exists. No function invoked inside the SQLite transaction may return a Promise or await asynchronous work.

### Transaction connection and concurrency

1. `startServer()` opens one `better-sqlite3` connection through `DatabaseManager`. The root composition injects the **same Database instance** into Foundation lifecycle, Student services, the End coordinator and winner resolver.
2. Foundation's `endRoundWithWinnerResolver()` starts one `BEGIN IMMEDIATE` transaction, verifies the Session/current Round/Active phase and expected `stateVersion`, then invokes the callback synchronously. It must not open another connection or await asynchronous work inside the transaction.
3. Student's resolver queries canonical Submissions on that same connection, ordered by persisted `accepted_order`, and constructs a Result for the first valid Submission, or returns `null`. It does not write Ended/Result or publish events.
4. Foundation writes Round Ended, increments `stateVersion`, stores/replaces the supplied Result, or—when callback returns `null`—creates no Result and clears any old Result for the same logical target. It commits the transaction.
5. Only after the synchronous transaction has committed and returned successfully does Foundation dispatch the existing `session:state:changed` snapshot. Socket.IO notification/delivery is post-commit asynchronous work; it is never awaited inside the SQLite transaction. No new event is added.

Student submission uses the same SQLite writer serialization and rereads current Active phase inside its `BEGIN IMMEDIATE` transaction:

- If Submission acquires the writer lock first, it commits the Submission and draft lock; End then sees that row and selects it if first by `accepted_order`.
- If End acquires the lock first, it selects the already committed set, commits Ended/Result and releases the lock; a later Submission rereads Ended and is rejected without writing.

There is no separate winner query followed by End, so no Submission can be accepted in the gap. If winner resolution, state validation, Result persistence or any write throws, SQLite rolls back the whole End transaction and Foundation does not dispatch a state event. SQLite busy/lock-timeout failures likewise produce no state event and must be returned as safe retryable errors.

### Dependency direction; no circular imports

- Teacher Feature depends on and calls only `StudentTrustedEndCoordinator`.
- Student coordinator depends on injected Foundation lifecycle port and Student resolver; it does not call Foundation repositories directly for End writes.
- Foundation accepts the generic `WinnerResolver` function and canonical `Result` type; Foundation does not import or reference the Student module.
- Student resolver uses the shared Database instance and canonical Submission repository; it does not import Foundation lifecycle implementation.
- The application composition root wires the three interfaces. This keeps the dependency direction acyclic while Foundation remains the sole owner of End/Result persistence and state publication.

### Failure mapping

- Missing/non-Teacher ActorContext: 401 `UNAUTHENTICATED`.
- Missing `round:end` or scope mismatch: 403 `FORBIDDEN`.
- Unknown Session/Round: 404 `SESSION_NOT_FOUND` / `TARGET_NOT_FOUND`.
- Round not Active or expected version stale: 409 `INVALID_PHASE` / `STALE_STATE`.
- Resolver or database failure: roll back; safe error response; no broadcast. Do not expose SQL details or candidate/losing answers.
- No Submission: successful End with no Result row; Student result projection returns `{ winner: null }` after Ended.

## Items Still Requiring Cross-Feature Review

1. Confirm `round:end` and how the trusted Teacher middleware issues it for a managed Session.
2. Confirm Teacher calls only `StudentTrustedEndCoordinator.endRound(...)` and receives the committed snapshot.
3. Confirm Foundation's internal synchronous `endRoundWithWinnerResolver` callback uses the same database connection/outer `BEGIN IMMEDIATE` transaction and retains post-commit-only publishing.
4. Confirm the application composition root wiring avoids Teacher↔Student↔Foundation circular imports.

These are interface implementation reviews, not unresolved product behavior. No Foundation public HTTP, DTO, shared permission type, or Socket.IO contract is changed by this proposal.
