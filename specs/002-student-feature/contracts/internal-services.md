# Student Internal End Contract

Teacher provides the trusted End command. Student selects the winner and Foundation owns End/Result persistence and state publication. T004 accepted the design on 2026-11-20. T070 checked the actual production composition and contracts on 2026-11-23 against T067/T068 automated evidence; this is a technical consistency review, not new owner/OpenSpec approval or manual acceptance. T041/T045 remain unchecked for explicit owner closeout, not for a missing adapter or Port.

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

The Student adapter and scoped authorization checks are implemented in `student-trusted-end-coordinator.ts`. T044 provides the formal Foundation Port in `session-lifecycle-service.ts`, implemented by `SessionLifecycleService`. The transaction command and `WinnerResolver` type live in `foundation-transactions.ts`. Actual `main.ts`/Teacher integration supplies the real Router and security adapters to the shared composition root. T067 validates startup/security and T068 validates formal HTTP End/Submit transactions; the earlier mock End transaction is not used.

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
    actor: ActorContext | null,
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

The signature above matches the implementation's guarded `ActorContext | null` argument. `TeacherScopedActorContext` describes the valid trusted caller, not a separate runtime identity or a replacement Foundation type.

The two input types are structurally aligned. Foundation owns its input, callback Port and canonical Result contract; it imports no Student type. The Coordinator imports the canonical Foundation Port and re-exports that type from its previous Student module path for compatibility; it declares no duplicate Port. Teacher generates `requestId` for tracing and safe logging only; this contract provides no idempotency guarantee.

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
- Teacher sockets omit `auth.sessionId`; transport connection alone grants no identity. On every watch the real resolver validates signed Cookie plus allowed Origin, rejects Student-routed sockets, and issues an unscoped Teacher context. Teacher watch authorization verifies trusted object provenance, Teacher kind, `session:watch` and Session existence. Student-routed sockets are separated at the composition root before this resolver can be called.
- Student handshake or watch identity failure rejects authorization. `app.ts` returns `null` without calling the external resolver if an identified Student credential is revoked/expired, or its credential/Participant/Session identity no longer matches. A socket carrying `auth.sessionId` also cannot enter the external resolver path when no verified Student identity exists. The outer Session event handler maps `null` to `UNAUTHENTICATED` and does not join the requested room. Client-declared role or permissions grant no authority.
- `createHttpServer` composes lifecycle, publisher, resolver and Coordinator with one Database and accepts `createTeacherRouter(services)`. `startServer(teacherIntegration = {})` forwards supplied adapters; the actual `main.ts` supplies `createTeacherIntegration(config)`. That integration installs a real Teacher Router and Socket resolver/authorizer, but intentionally supplies no global `resolveActorContext`: Teacher HTTP authentication and Session scoping are local to its Router.
- Teacher Cookie, Origin and CSRF tests, mixed-Cookie isolation and Student-failure fallback tests are required for formal integration acceptance. The accepted local single-Teacher Demo limitation is that logout does not evict existing Socket rooms.

## T004 approval and remaining implementation verification

Teacher and Student/Foundation accepted the design in section 5 on 2026-11-20. T004 is complete. Current evidence and remaining closeout are:

1. T044 is implemented and independently verified; T068 also exercises its Port through the actual composed Teacher HTTP path.
2. T067 completes real Teacher startup/security and Student fallback-isolation evidence for T045. The original T045 checkbox is retained pending owner closeout; no additional missing implementation/security case was identified at T070.
3. T068 completes deterministic HTTP writer overlap, duplicate End, rollback/publication failure and isolated Result-replacement evidence for T041. The original T041 checkbox is likewise retained; no extra technical blocker is invented to justify its unchecked state.
4. T070 records technical contract/diagram consistency. T059 owner closeout, T071/T060 final regression and T069/T061 browser acceptance remain separately tracked. Do not convert automated evidence to manual approval.

This approval records interface and responsibility-design review; it does not certify implementation or tests. Foundation public HTTP, DTO and Socket.IO contracts remain the integration baseline.

## Implemented composition seam (2026-11-21)

`apps/server/src/app.ts` exports:

```ts
interface TeacherServiceDependencies {
  readonly database: Database.Database;
  readonly sessionLifecycle: SessionLifecycleService;
  readonly endCoordinator: StudentTrustedEndCoordinator;
}

// Relevant FoundationServerOptions member:
interface TeacherRouterComposition {
  createTeacherRouter?: (services: TeacherServiceDependencies) => ExpressRouter;
}

type TeacherIntegrationOptions = Pick<FoundationServerOptions,
  'createTeacherRouter' | 'resolveActorContext' |
  'resolveSocketActorContext' | 'authorizeWatch'>;
```

Startup opens/migrates one Database, then creates Student draft/submission services and mounts an empty Teacher router container before the terminal error handlers. After HTTP/Socket servers, membership handling and the state publisher are ready, it creates one lifecycle, one winner resolver and one Coordinator. The factory receives those ready instances; its returned router is installed beneath `/api/v1/teacher`. Supplying the factory without a Database, or together with a prebuilt `teacherRouter`, is rejected. Without an adapter no Teacher endpoints are installed.

Teacher connects its real router using this factory and calls `services.endCoordinator.endRound(input, trustedSessionActor)` once. It must not wrap that call in another transaction or call lifecycle End separately. For other Teacher controls it receives the same `sessionLifecycle`; repositories use the supplied Database. `createHttpServer` also returns `endCoordinator` alongside its existing lifecycle/publisher, or `null` without a Database.

The implemented Teacher adapter is `modules/teacher/integration.ts`. Its factory builds the Teacher repositories/login service on the supplied Database, then creates the Router and Socket identity. `api/teacher/teacher-router.ts` verifies mutation Origin, login Cookie and CSRF; `middleware/session-scope.ts` verifies Session existence and calls `teacher-actor-factory.ts` to issue `round:end`. `RoundControlService.end` supplies the current Round ID and a server-generated requestId to the single Coordinator call. Teacher login uses the signed `teacher_session` Cookie (Path=/, HttpOnly, SameSite=Strict, 8-hour lifetime; Secure in production); Student uses its distinct opaque Cookie.

T067 exercises these real adapters, not just controlled adapters. T068 exercises the real HTTP End path with test-only fault injection and deterministic writer barriers. The accepted logout/room-revocation limitation and repeated-End 409 behavior are unchanged. No production test endpoint exists.

## Lifecycle/read compatibility checked at T070

| Operation | Current behavior / owner |
| --- | --- |
| Session with no Round | Foundation snapshot is Waiting, `currentRoundId`/target null; current-target returns null and results an empty list. |
| Teacher select/next/reopen | `/api/v1/teacher/sessions/:sessionId/rounds/select` or `/next`, with expectedStateVersion (select also takes target). Teacher catalog selects an answerable target; Foundation permits a new Round only with no current Round or after Ended. A new ID enters Waiting; it is not automatically Active. |
| Teacher start | `/rounds/start` delegates to shared lifecycle; Waiting -> Active with new stateVersion/changedAt and post-Commit state event. |
| Student submit | Requires current Active Round and current leader; persisted draft -> canonical Submission/Answers, acceptedOrder and draft lock in one immediate transaction. It does not change Round phase. |
| Teacher end | `/rounds/end` accepts expectedStateVersion. Router issues scoped actor; Coordinator -> synchronous Foundation Port/resolver -> Ended/Result/version, then publish. No client winner/order or idempotency guarantee. |
| Student reads | Waiting does not expose target content; current Active permits target/draft, current Ended permits only the Student winner projection. Draft edit/submit reject Ended; new Round has new draft scope. |

Teacher `round:end` is an internal permission, not a new Foundation public command endpoint. Public Foundation paths, DTOs and `session:*` event shapes were not changed. T068's separate test worker/observer connections target the same isolated database file; each actual End transaction still uses one captured Database instance. SQLite busy currently maps to safe HTTP 500; it may occur during Student credential metadata update before SubmissionService. Test-only `busy_timeout=0` is not a production setting. These facts add no retry or delivery guarantee.
