# Student Internal End Contract

Teacher provides the trusted End command. Student selects the winner and Foundation owns End/Result persistence and state publication. T004 accepted the interface and responsibility design on 2026-11-20, as recorded in `docs/integration/student-teacher-decisions.md` section 5. Production connection, Teacher authorization and security tests remain implementation and integration work.

## Foundation ActorContext Permission Baseline

Foundation currently defines `ActorContext.permissions` as `readonly string[]`. Its existing implemented read capabilities are:

- `session:read`
- `session:watch`
- `target:preview`
- `target:read`
- `results:read`

The accepted `round:end` capability belongs to a server-created Teacher context scoped to the Session. Teacher owns production issuance, signed Cookie validation and HTTP Origin/CSRF protection. T044 implements the Foundation internal Port and T045 completes composition and Socket fallback isolation.

Use the canonical Foundation `ActorContext` directly:

```ts
type TeacherScopedActorContext = ActorContext & {
  actorKind: 'teacher';
  sessionId: UUID;
};
```

It is produced by trusted Teacher authentication middleware, never request JSON.

## Single Teacher End Interface with Student Winner Resolver

The Student adapter and its scoped authorization checks are implemented in `student-trusted-end-coordinator.ts`. T044 provides the formal Foundation Port in `session-lifecycle-service.ts`, implemented by `SessionLifecycleService`. The transaction command and `WinnerResolver` type live in `foundation-transactions.ts`. End integration tests now inject that actual lifecycle service into the existing Coordinator; the former local mock transaction has been removed. Production composition and Teacher security adapters await T045.

Teacher calls exactly one trusted internal service. It does not invoke the Foundation lifecycle service and Student resolver as separate operations.

```ts
interface StudentEndRoundInput {
  sessionId: UUID;
  roundId: UUID;
  expectedStateVersion: number;
  requestId: string;
}

interface StudentTrustedEndCoordinator {
  endRound(
    input: StudentEndRoundInput,
    actor: TeacherScopedActorContext,
  ): SessionStateSnapshot; // synchronous; transaction work completes before return
}

type WinnerResolver = (roundId: UUID) => Result | null; // synchronous; never return/await a Promise

// Defined by Foundation in foundation-transactions.ts.
// This type must not import StudentEndRoundInput or reuse the existing persistence EndRoundInput name.
interface FoundationLifecycleEndInput {
  sessionId: UUID;
  roundId: UUID;
  expectedStateVersion: number;
  requestId: string;
}

interface FoundationLifecycleEndPort {
  endRoundWithWinnerResolver(
    input: FoundationLifecycleEndInput,
    resolveWinner: WinnerResolver,
  ): SessionStateSnapshot; // synchronous; commits before returning
}

interface StudentWinnerResolver {
  resolveWinnerInTransaction(roundId: UUID): Result | null; // synchronous database reads only
}
```

`StudentTrustedEndCoordinator.endRound()` is a synchronous in-process call. It checks `actor.actorKind === 'teacher'`, matching `sessionId`, and the accepted `round:end` capability. It then calls the injected `FoundationLifecycleEndPort` once, passing the Student resolver callback. The Teacher UI sends no winning Submission ID and receives only the committed state snapshot. The callback is synchronous and returns the canonical Foundation `Result` candidate, or `null` when no Submission exists. No function invoked inside the SQLite transaction may return a Promise or await asynchronous work.

The two input types are structurally aligned. Foundation owns its input, callback Port and canonical Result contract; it imports no Student type. The existing Coordinator code still needs its Port type aligned in T045. Teacher generates `requestId` for tracing and safe logging only; this contract provides no idempotency guarantee.

T044's lifecycle method rejects caller-owned transactions, then the transaction function obtains the outer `BEGIN IMMEDIATE` lock and validates the requested Session, Round ownership/current selection, Active phase and expected version before invoking the resolver. The existing `endRoundWithResult` persistence runs on the same connection as a nested savepoint, including its existing logical-target Result replacement/removal. The authoritative snapshot is captured within the outer transaction. Only after the outer Commit does the lifecycle method call the publisher. A Promise/thenable returned by the resolver is rejected; notification work returned after Commit may settle asynchronously and is observed for failure without delaying End.

### Transaction connection and concurrency

1. `startServer()` opens one `better-sqlite3` connection through `DatabaseManager`. The root composition injects the **same Database instance** into Foundation lifecycle, Student services and winner resolver. The existing Coordinator receives the lifecycle Port and bound resolver.
2. Foundation's `endRoundWithWinnerResolver()` starts one `BEGIN IMMEDIATE` transaction, verifies the Session/current Round/Active phase and expected `stateVersion`, then invokes the callback synchronously. It must not open another connection or await asynchronous work inside the transaction.
3. Student's resolver queries canonical Submissions on that same connection, ordered by persisted `accepted_order`, and constructs a Result for the first valid Submission, or returns `null`. It does not write Ended/Result or publish events.
4. Foundation writes Round Ended, increments `stateVersion`, stores/replaces the supplied Result, or—when callback returns `null`—creates no Result and clears any old Result for the same logical target. It commits the transaction.
5. After the outer transaction commits and returns, Foundation calls the existing `session:state:changed` publisher without waiting for delivery. It catches and logs notification exceptions and still returns the committed snapshot successfully. Resolver/persistence rollback publishes nothing.

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
- Round not Active or expected version stale: 409 `INVALID_PHASE` / `STALE_STATE`. A repeated End may return either; Teacher refreshes the authoritative Session state before updating the UI.
- Resolver or database failure: roll back; safe error response; no broadcast. Do not expose SQL details or candidate/losing answers.
- No Submission: successful End with no Result row; Student result projection returns `{ winner: null }` after Ended.
- Post-commit notification failure: retain the successful committed response and record the delivery failure. Recover state through the existing snapshot read/watch flow.

## Accepted Socket and composition boundary

- Teacher HTTP resolution applies only to Teacher-specific paths. It verifies the signed Cookie and requested Session before constructing a scoped ActorContext for End. Common Student Session reads continue to resolve the Student identity.
- Teacher sockets omit `auth.sessionId` and validate Teacher signed Cookie plus allowed Origin. The trusted resolver rejects sockets with Student handshake scope or identity. Teacher watch authorization verifies trusted actor provenance, teacher kind, `session:watch` and Session existence.
- Student handshake or watch identity failure rejects authorization. T045 updates `app.ts` so an already identified Student socket whose credential can no longer be resolved returns `null` without calling Teacher fallback.
- `createHttpServer` composes the existing lifecycle, publisher, resolver and Coordinator with one Database and exposes the services to the Teacher router. `startServer` supplies Teacher HTTP and Socket resolvers and watch authorization. T045 arranges router mounting after dependencies are available.
- Teacher Cookie, Origin and CSRF tests, mixed-Cookie isolation and Student-failure fallback tests are required for formal integration acceptance. The accepted local single-Teacher Demo limitation is that logout does not evict existing Socket rooms.

## T004 approval and remaining implementation verification

Teacher and Student/Foundation accepted the design in section 5 on 2026-11-20. T004 is complete. Implementation verification remains:

1. T044 implements the Foundation-owned input and synchronous Port, in-transaction checks, atomic Result/state persistence and post-commit notification error isolation. Its independent verification is recorded in the Quickstart; production wiring remains T045.
2. T045 reuses the Coordinator, wires the shared services and Teacher router, and removes Student-to-Teacher Socket fallback. Teacher implements trusted credential/capability issuance and security adapters.
3. T041 validates Submit/End races and rollback/publication behavior through the actual T044/T045 path.
4. T059–T061 validate contracts, regression and formal browser/security acceptance.

This approval records interface and responsibility-design review; it does not certify implementation or tests. Foundation public HTTP, DTO and Socket.IO contracts remain the integration baseline.
