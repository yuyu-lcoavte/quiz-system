# Student Feature Foundation Review Gate

**Scope**: T001–T003 verification and proposal record for `002-student-feature`.

**Status**: T001–T003 completed by checking the repository and current contracts. T004 is **pending**. The Student architecture owner has decided the responsibility direction, but the Teacher/Foundation member has not yet approved each proposed capability or internal signature. Nothing in this document grants a new permission or changes a Foundation public contract.

## T001 — Existing workspace and Foundation reuse

### Environment and workspaces

| Check | Observed state |
|---|---|
| Git branch | `feature/student` (read-only check; no branch operation performed) |
| Node.js / npm | Node `v22.15.0`; npm `10.9.2`; Plan minimum is Node `22.12+` |
| npm workspaces | Root `package.json` defines exactly `packages/contracts`, `apps/server`, and `apps/web` |
| Web app | Single `@quiz/web` React/Vite application; existing Router is in `apps/web/src/app/router.tsx` |
| Server | `@quiz/server` uses Express 5, Socket.IO 4, and `better-sqlite3` |
| Contracts | `@quiz/contracts` exports shared domain, HTTP, error, identity and realtime types |
| Test tools | Installed root tools: Vitest `5.1.0`, Supertest `7.3.2`, Socket.IO Client `4.8.4`; root scripts provide `test`, `typecheck`, `build`, and `check` |
| Ignore configuration | `.gitignore` exists and covers `node_modules/`, build output, coverage, `.env*` (except `.env.example`), logs and local SQLite data |

### Foundation source paths and reuse boundary

| Capability | Existing source | Student reuse boundary |
|---|---|---|
| HTTP/server composition | `apps/server/src/app.ts`, `apps/server/src/api/router.ts` | Register Student routes in the existing Express app and composition root; do not create another server. `startServer()` opens one database and passes it to Foundation services. |
| Trusted HTTP identity seam | `apps/server/src/api/middleware/actor-context.ts`; `packages/contracts/src/identity.ts` | The middleware accepts only an injected server resolver and defaults to no identity; protected routes fail closed. Student supplies cookie-to-Participant resolution, not client-provided identity. |
| SQLite connection and migrations | `apps/server/src/persistence/database.ts`, `apps/server/src/persistence/migrate.ts` | Reuse the root `DatabaseManager` connection and additive migration runner. Each opened connection enables and verifies foreign keys. |
| Canonical repositories | `apps/server/src/persistence/repositories/index.ts` and repository files in the same directory | Reuse Foundation Session, Round, Question, Blank, QuestionGroup, Team, Participant, Submission, SubmissionAnswer and Result repositories; Student tables are additive and do not duplicate canonical entities. |
| Session reads and lifecycle | `apps/server/src/modules/sessions/application/session-query-service.ts`, `session-state-service.ts`, `session-lifecycle-service.ts`, `foundation-transactions.ts` | Reuse Activity Code/current-target/state reads and lifecycle transactions. Teacher command UI and authorization remain Teacher-owned. The current End operation accepts a preselected Result; the proposed resolver callback is a separate internal change described under T003. |
| HTTP routes and authorization | `apps/server/src/modules/sessions/api/session-router.ts`, `session-controller.ts`; Foundation HTTP contracts | Reuse current Session routes and envelopes. Student adds only Student-owned routes; no Foundation public path or DTO is changed. Current protected reads check server ActorContext scope and capabilities. |
| Socket.IO | `apps/server/src/realtime/socket-server.ts`, `session-events.ts`, `session-room.ts`, `session-state-publisher.ts` | Reuse the same Socket.IO server, existing `session:*` events and server-computed Session rooms. Student registers its own draft events and resolves its own cookie identity; Foundation does not provide Student authentication. |
| Student state client | `apps/web/src/services/session-state-client.ts` | Reuse for authoritative Session snapshots, stale-version rejection, and re-watch after reconnect; do not duplicate Foundation state events. |
| Shared type contracts | `packages/contracts/src/domain.ts`, `errors.ts`, `http.ts`, `identity.ts`, `realtime.ts` | Reuse canonical types and envelopes; add Student-specific DTOs/events only in Student contract modules. |

The inspected test configuration is `vitest.config.ts`; existing API, persistence, realtime, route and state-client test examples are under `tests/` and `apps/web/src/app/`.

## T002 — Current capabilities and proposed additions

The Foundation identity contract defines these existing capability names for its read/synchronization boundary:

| Capability | Current purpose/source |
|---|---|
| `session:read` | Protected Session and state reads (`session-controller.ts`) |
| `session:watch` | Authorized Foundation `session:watch` subscription (Foundation realtime contract) |
| `target:preview` | Teacher target preview while Waiting (`session-controller.ts`) |
| `target:read` | Authorized current-target read (`session-controller.ts`) |
| `results:read` | Protected Foundation results read (`session-controller.ts`) |

The proposed Teacher End capability is `round:end`. Teacher middleware must authorize the Session before issuing it in a server-created ActorContext.

## T003 — Internal End service proposal

### Single Teacher End call and synchronous Winner Resolver proposal

The proposed in-process signatures are:

```ts
interface StudentTrustedEndCoordinator {
  endRound(input: EndRoundInput, actor: TeacherScopedActorContext): SessionStateSnapshot;
}

type WinnerResolver = (roundId: UUID) => Result | null;

interface FoundationLifecycleEndPort {
  endRoundWithWinnerResolver(
    input: EndRoundInput,
    resolveWinner: WinnerResolver,
  ): SessionStateSnapshot;
}
```

All three calls are synchronous. The composition root must inject the same `better-sqlite3` Database instance used by `DatabaseManager`; Foundation opens one `BEGIN IMMEDIATE` transaction, invokes the Student resolver synchronously on that connection, persists Ended/stateVersion and Result (or no Result), then commits. No Promise may be returned or awaited from transaction work. Only after successful commit may Foundation dispatch the existing `session:state:changed` notification; notification delivery is not awaited inside the transaction. Resolver or persistence failure rolls back and does not publish. With no Submission, the resolver returns `null`; Foundation creates no Result and clears the old Result for the same logical target. Teacher calls only the coordinator and does not select a winner or separately call Foundation End.

### Current implementation boundary

The inspected Foundation implementation has `endRoundWithResult()` in `apps/server/src/modules/sessions/application/foundation-transactions.ts` and `SessionLifecycleService.endRound()` in `session-lifecycle-service.ts`. It accepts a supplied static Result before its own transaction; it does **not** currently expose the proposed synchronous resolver callback. The existing lifecycle publishes after its transaction returns. T044 is therefore a planned minimal Foundation **internal** service seam, not an existing implementation. Foundation HTTP paths, DTOs, event names and payloads remain unchanged.

## T004 review record — Pending

No cross-member approval is claimed here. Before T004-dependent implementation, record the Teacher/Foundation reviewers and their decisions on:

1. Confirm `round:end` and trusted Teacher middleware issuance for the requested Session.
2. Teacher's single call to `StudentTrustedEndCoordinator.endRound(...)`.
3. Synchronous `WinnerResolver(roundId): Result | null` execution in Foundation's existing `BEGIN IMMEDIATE` transaction and shared connection ownership.
4. No-winner Result handling, rollback/no-broadcast behavior, and composition-root wiring without a circular dependency.

T004 remains unchecked in `specs/002-student-feature/tasks.md`. These are internal integration proposals; no Foundation public API, DTO or Socket.IO contract is being changed by T001–T003.

## T004 technical review preparation

### Confirmed in the repository

- The Student baseline at `f5197bb` has automatic succession, a Team-scoped `student:membership:changed` notification, and a Cookie-authenticated `/me` read. The notification prompts a refresh and carries no leader ID. Student submission rereads the current leader inside its own `BEGIN IMMEDIATE` transaction.
- `TeamLeaderRepository.replaceIfCurrent`, the one-row-per-Team constraint and the composite Team/Participant foreign key are reusable. Automatic succession rereads the leader and candidate presence under the write lock. Its pending offline assignment is process-local and compared with the current Participant and assignment timestamp.
- `ActorContext` supports Teacher as an actor kind and a server-populated string list of permissions. The proposed `round:end` has no production issuer in the inspected code. Teacher routes are placeholders. The `origin` branch listing contains `master`, `feature/foundation` and `feature/student`; Teacher or OpenSpec work held elsewhere could not be inspected.
- `SessionLifecycleService.endRound(sessionId, expectedStateVersion, result?)` and `endRoundWithResult` exist. The latter commits Ended, the incremented version and Result replacement or removal together. `StudentWinnerResolver.resolveWinnerInTransaction(roundId)` exists and selects by persisted `acceptedOrder`, using its injected Database instance. It checks `inTransaction`; the Foundation caller must supply the correct connection and own the immediate transaction.
- Foundation persists Result and emits `session:state:changed` via its lifecycle publisher after the transaction returns. Failure inside the existing End transaction exits before publication. Student projects the persisted Result for the current Ended Round. Teacher owns authentication, scoped command authorization and UI.
- Targeted baseline verification passed 25 tests across six files covering Foundation persistence/state notifications and Student succession/submission/winner/result. This run exercises existing code paths and does not verify the proposed Teacher integration.

### Changes needed after review

| Task | Minimum change |
| --- | --- |
| T041 | Exercise the real End path with both write-lock orders, stale Round/version, no winner and prior logical-target Result removal, resolver/persistence failure and zero publication on rollback. At publication, assert that another connection can read committed state and Result. |
| T044 | Add an internal Foundation End entry taking the requested Session, Round, expected state version and synchronous winner callback. Verify scope/current Round/Active/version under the same `BEGIN IMMEDIATE` lock, call the callback once on that connection and reuse existing End/Result persistence. Keep the current internal supplied-Result caller compatible and share the transaction body. The publishing lifecycle entry must own the outer transaction so an inner savepoint cannot be mistaken for Commit. |
| T045 | Add the trusted Student End coordinator to enforce the reviewed Teacher scope/permission and delegate once to Foundation with the existing bound Student resolver. Compose both with the same Database instance. Teacher receives the committed snapshot; Foundation never imports Student. |

### Copy-ready review checklist

- **Teacher** — Identify the branch or commit, confirm trusted Session authorization, `round:end` issuance, and the single synchronous End signature and error mapping.
- **Foundation**: Confirm one outer `BEGIN IMMEDIATE`, with Session/current Round/Active/version checked before invoking the synchronous resolver on the same Database instance. Confirm Result replacement and no-winner removal, committed snapshot, post-Commit publication and zero publication on rollback. Confirm composition in the server root and reuse of the existing public state event.
- **OpenSpec / Teacher**: Align Q02/U02 acceptance on first join, last valid socket, earliest eligible online successor, no candidate, reassessment on later valid arrival/re-subscribe, same identity after F5 and no automatic reclaim of a replaced role. Confirm joint acceptance of server-side submission eligibility.
- **Gate closeout**: Record each reviewer's name/role, date, branch/commit if available, and the accepted or revised signatures, capabilities and decisions in `student-teacher-decisions.md`. T004 remains pending until the required reviewers confirm. If a proposal is rejected, reconcile the design before implementation.

After T004, run T041 against the T044/T045 production path, then T059, T060 and T061. Student Coordinator and test-only contract verification can be prepared independently.

## Independent preparation before T004

### 2026-11-14 Student rule update, awaiting cross-group synchronization

OpenSpec/Teacher should align Q02/U02 acceptance with the Student decision: initial leader is the first successful join; loss of the last valid socket triggers immediate selection of the earliest eligible online teammate, with no configurable grace. Other sockets preserve presence. With no candidate the assignment stays; a replaced leader recovers identity but not leadership after F5/reconnect. Align how both implementations show role changes and test eligibility at submit time. See [Student Spec](../../specs/002-student-feature/spec.md) and [Realtime Contract](../../specs/002-student-feature/contracts/student-realtime.md).

T004 remains pending for Teacher End authorization, the same-transaction Foundation callback and production wiring.
- The current Student submission test suite uses two connections to the same temporary SQLite file. An independent writer holds `BEGIN IMMEDIATE`; the real Student submission observes contention, leaves the draft editable and emits no lock notification. After the writer releases the lock, a new submission succeeds; the synchronous resolver then sees the committed candidate without persisting a Result. This exercises the SQLite and Student prerequisites for T041.

### T041 test design (provisional)

After the callback signature is approved and the actual End path is wired, use two connections to one isolated database. Coordinate transaction order with explicit test barriers, using a separate worker for operations that block synchronously. On the End side the Foundation transaction and Student resolver must share one connection. Observe published snapshots and query committed data from the other connection when a notification is received.

| Scenario | Assertion after integration |
| --- | --- |
| Submission obtains the write lock first | End sees the accepted Submission and draft lock after commit. The winner is the earliest by persisted `acceptedOrder`; the published Ended snapshot is already backed by the committed Result. |
| End obtains the write lock first | Submission rereads Ended and is rejected once the lock is released. No additional Submission, answers or lock notification. |
| Reopened target has no successful Submission | End creates no Result, clears the prior logical target Result, and Student projects `winner: null`. |
| Resolver or Result write fails | Round phase, `stateVersion` and the previous Result remain unchanged. No Ended publication; a subsequent valid submission remains possible while Active. |

The test design leaves the Teacher entry point and Foundation callback invocation to the reviewed interfaces. T041, T044 and T045 remain unchecked.
