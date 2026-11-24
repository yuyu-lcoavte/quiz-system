# Student Feature Foundation Review Gate

**Scope**: T001–T003 verification and T004 design approval for `002-student-feature`.

**Status (T070, 2026-11-23)**: T004 design review completed on 2026-11-20. T044 is implemented; real Teacher startup/security and formal-path transaction evidence passed at T067/T068. Original T041/T045/T059 checkboxes remain for owner closeout, while T071/T060 final regression and T069/T061 manual acceptance remain separate. No new owner or OpenSpec approval is inferred.

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
| Session reads and lifecycle | `apps/server/src/modules/sessions/application/session-query-service.ts`, `session-state-service.ts`, `session-lifecycle-service.ts`, `foundation-transactions.ts` | Reuse Activity Code/current-target/state reads and lifecycle transactions. Original supplied-Result persistence is reused by the implemented synchronous resolver callback Port. Teacher command UI and authorization remain Teacher-owned. |
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

The accepted Teacher End capability is `round:end`. The real Teacher Router verifies login Cookie and Session, then `teacher-actor-factory.ts` issues the scoped capability. Foundation supplies the shared type but does not issue Teacher authority. T067 verifies the real trust boundary.

## T003 — Internal End service design accepted at T004

### Single Teacher End call and synchronous Winner Resolver

The accepted design distinguishes Student input from the Foundation-owned input. T044 implemented the name below; Coordinator imports the canonical Port rather than declaring a second one:

```ts
interface StudentTrustedEndCoordinator {
  endRound(input: StudentEndRoundInput, actor: ActorContext | null): SessionStateSnapshot;
}

type WinnerResolver = (roundId: UUID) => Result | null;

// Foundation owns this type; its fields align structurally with StudentEndRoundInput.
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
  ): SessionStateSnapshot;
}
```

All three calls are synchronous. The composition root injects the same `better-sqlite3` Database instance into lifecycle, submission and winner resolver. Foundation owns one outer `BEGIN IMMEDIATE`, checks Session/current Round/Active/version before invoking the callback, and commits Ended/stateVersion/Result together. After commit it calls the existing state publisher without waiting for delivery. Notification exceptions are caught and logged while the committed snapshot remains the successful return value. Resolver or persistence failure rolls back and publishes nothing. No winner clears the prior Result for the same logical target. Teacher calls only the coordinator.

### Current implementation boundary

T044 implements the Foundation input, callback transaction and Port; original Result persistence is reused through same-connection savepoints. The root composes lifecycle/publisher/resolver/Coordinator once. Actual `main.ts` calls `startServer(createTeacherIntegration(config))`, supplying real Router and Socket adapters; HTTP Teacher identity remains local to its Router. T067 tests startup/security and T068 tests actual HTTP transaction behavior. Original task closeout remains distinct from this technical evidence.

## T004 review record — Design approved 2026-11-20

Review evidence is recorded in `student-teacher-decisions.md`, sections 5.1–5.4. Teacher reviewed on 2026-11-20 from `feature/teacher`; the Student/Foundation owner accepted the merged section in this work session on the same date. The accepted items are:

1. `round:end` and trusted Teacher middleware issuance for the requested Session.
2. Teacher's single call to `StudentTrustedEndCoordinator.endRound(...)`.
3. Synchronous `WinnerResolver(roundId): Result | null` execution in Foundation's existing `BEGIN IMMEDIATE` transaction and shared connection ownership.
4. No-winner Result handling, rollback/no-broadcast behavior, and composition-root wiring without a circular dependency.

5. Student handshake or watch identity failure cannot fall back to Teacher. `app.ts` fixes the watch fallback and real Teacher adapters verify signed Cookie/Origin and trusted watch authorization; T067 provides call-through observations and positive controls.
6. Teacher HTTP Origin/CSRF and Socket Cookie/Origin verification are required for formal integration acceptance. `requestId` is tracing only; Teacher refreshes authoritative state after either 409 `STALE_STATE` or `INVALID_PHASE`.

T004 remains complete as a design gate. T044 and T067/T068 provide implemented Port, real security and formal transaction evidence in Quickstart. T041/T045 are not automatically closed by this review; no further missing code/security/race case was identified. OpenSpec leadership-rule synchronization remains separately pending.

## T004 technical review preparation

### Historical source inventory before T004 approval

The following inventory records the earlier preparation baseline; the approved design and current remaining work are recorded above and below.

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
| T044 | Independently implemented and verified. The formal Foundation Port checks scope/current Round/Active/version before the resolver, reuses End/Result persistence and isolates notification failures after outer Commit. |
| T045 | Reuse the existing Coordinator with the bound resolver and approved Foundation Port. Wire the shared Database, lifecycle, publisher and Teacher router in the composition root. Fix Student watch failure to return null without Teacher fallback; test mixed Cookies, invalid credentials and scopes. Teacher owns Cookie/Origin/CSRF, trusted Teacher actors and watch authorization. |

### Copy-ready review checklist

- **Teacher** — Identify the branch or commit, confirm trusted Session authorization, `round:end` issuance, and the single synchronous End signature and error mapping.
- **Foundation**: Confirm one outer `BEGIN IMMEDIATE`, with Session/current Round/Active/version checked before invoking the synchronous resolver on the same Database instance. Confirm Result replacement and no-winner removal, committed snapshot, post-Commit publication and zero publication on rollback. Confirm composition in the server root and reuse of the existing public state event.
- **OpenSpec / Teacher**: Align Q02/U02 acceptance on first join, last valid socket, earliest eligible online successor, no candidate, reassessment on later valid arrival/re-subscribe, same identity after F5 and no automatic reclaim of a replaced role. Confirm joint acceptance of server-side submission eligibility.
- **Gate closeout**: Completed on 2026-11-20 in `student-teacher-decisions.md` section 5. This records interface and responsibility-design acceptance. Formal implementation and integration evidence remain in the subsequent tasks.

After T004, run T041 against the T044/T045 production path, then T059, T060 and T061. Student Coordinator and test-only contract verification can be prepared independently.

## Independent preparation before T004

### 2026-11-14 Student rule update, Teacher no objection recorded 2026-11-20

Teacher recorded no objection to FR-004 in section 5.1. Student remains responsible for synchronizing OpenSpec Q02/U02 acceptance; no OpenSpec approval is recorded. The first successful join is leader; loss of the last valid socket immediately selects the earliest eligible online teammate. With no candidate the assignment stays. A replaced leader recovers identity and reads the current role after F5/reconnect. See [Student Spec](../../specs/002-student-feature/spec.md) and [Realtime Contract](../../specs/002-student-feature/contracts/student-realtime.md).

T004 design approval is complete. Foundation callback, composition and real Teacher authorization/router now have T067/T068 automated evidence. Historical preparation below is retained, not a new missing-work claim.
- The current Student submission test suite uses two connections to the same temporary SQLite file. An independent writer holds `BEGIN IMMEDIATE`; the real Student submission observes contention, leaves the draft editable and emits no lock notification. After the writer releases the lock, a new submission succeeds; the synchronous resolver then sees the committed candidate without persisting a Result. This exercises the SQLite and Student prerequisites for T041.

### T041 test design (provisional)

After the actual T044/T045 End path is wired, use two connections to one isolated database. Coordinate transaction order with explicit test barriers, using a separate worker for operations that block synchronously. On the End side the Foundation transaction and Student resolver must share one connection. Observe published snapshots and query committed data from the other connection when a notification is received. Also verify that a notification exception after commit preserves the successful End response.

| Scenario | Assertion after integration |
| --- | --- |
| Submission obtains the write lock first | End sees the accepted Submission and draft lock after commit. The winner is the earliest by persisted `acceptedOrder`; the published Ended snapshot is already backed by the committed Result. |
| End obtains the write lock first | Submission rereads Ended and is rejected once the lock is released. No additional Submission, answers or lock notification. |
| Reopened target has no successful Submission | End creates no Result, clears the prior logical target Result, and Student projects `winner: null`. |
| Resolver or Result write fails | Round phase, `stateVersion` and the previous Result remain unchanged. No Ended publication; a subsequent valid submission remains possible while Active. |

T044 tests exercise the formal Foundation Port/Coordinator with a shared Database. T067/T068 exercise real Teacher composition/security and HTTP races. T041/T045 remain unchecked for explicit owner closeout; their completed technical evidence must not be described as a still-missing adapter.

## T045 implementation preparation — 2026-11-21

This section is historical. T067/T068 and the T070 record below supersede its then-pending Teacher adapter/security status.

`createHttpServer` constructs one lifecycle/publisher/resolver/Coordinator from the shared Database. The optional `createTeacherRouter(TeacherServiceDependencies)` receives the ready services and mounts its returned router under `/api/v1/teacher`; `startServer(TeacherIntegrationOptions)` forwards the factory and trusted HTTP/Socket adapters. No Teacher routes or authority are installed by default. The Coordinator imports the canonical Foundation Port without wrapping an additional End transaction.

The targeted composition and Socket tests pass 16 cases: actual Student watch, persisted Submission resolved inside the shared transaction, committed state/Result visible before Socket publication, repeated End, startup adapter injection and DB closure, revoked/expired Student identity with mixed Cookies, and controlled Teacher Cookie/Origin/watch-adapter rejection. These are automated tests, not real Teacher security or browser acceptance.

T045 remains open. Teacher must supply its real router, scoped HTTP authentication/`round:end` issuance, mutation Origin/CSRF enforcement, signed-Cookie/Origin Socket resolver and provenance-aware Session watch authorizer. Validate mixed Cookies and failure paths again with those actual adapters. T041 and T059–T061 remain unchanged.

## T070 current technical review — 2026-11-23

- **Composition / signatures**: `main.ts` -> real `createTeacherIntegration` -> `startServer` -> `createHttpServer`; `TeacherServiceDependencies` carries the same Database/lifecycle/Coordinator. Teacher Router creates authentication and `RoundControlService`; End generates requestId and delegates once. Coordinator's actual argument is `ActorContext | null`, guarded to Teacher kind, matching Session and `round:end`; Foundation owns its input and synchronous callback. No reverse Student import or second End transaction was found.
- **State / visibility**: A Session without a Round is Waiting with null target. Select/Next/reopen creates new Waiting only after Ended or with no current Round; Start activates it. Submit persists answers/order and locks only its Team draft, not the Round. End atomically persists Result and Ended/version before publication. Waiting target content and premature results remain unavailable to Students; reopening clears/replaces only its own logical-target Result.
- **Security**: Teacher HTTP Cookie/Origin/CSRF and scoped capability issuance exist under its Router. Teacher Socket transport alone grants nothing; every watch resolves signed Cookie/Origin and checks issued-object provenance/kind/permission/Session existence. Student failures never call the external resolver/authorizer, including mixed Cookies. Existing-room revocation after Teacher logout remains the accepted limitation.
- **Evidence**: T067 targeted 3 files/33 tests and full 77/436; T068 targeted 3 files/47 tests and full 77/445, including HTTP writer barriers, duplicate End, Rollback and safe publication failure. These are prior executions, not T070 test or manual runs. Current busy handling is HTTP 500; Student credential metadata may encounter it before SubmissionService. No retry guarantee is added.
- **Contract result**: No incompatible public Foundation HTTP/DTO/Socket change was found. Student documentation now matches existing DTOs/errors, 24-hour credential behavior and actual trust/initialization boundaries. Actual paths replace the old proposed Port filename. Student diagrams reflect installed Teacher integration and verified transaction/security flow; PNG evidence is in Quickstart.
- **Task state**: T041 and T045 have their required technical evidence via T067/T068; only explicit owner review/checkbox closeout is outstanding here, with no additional unbuilt work identified. T059 technical review is covered here but its checkbox remains unchanged. T071/T060 require final integrated checks after this review; T069/T061 require real Windows/Teacher/two-Team browser results and timings. No other reviewer or OpenSpec approval is declared.
