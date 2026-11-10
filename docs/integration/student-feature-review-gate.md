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

The following are **proposed additions only**, not existing Foundation grants or implemented permissions:

| Proposed capability | Intended use | Status |
|---|---|---|
| `team:leader:transfer` | Teacher-authorized request to Student's trusted leader-transfer service | Pending T004 Teacher/Foundation review; not currently granted by Foundation |
| `round:end` | Teacher ActorContext authorization for the single Student End coordinator call | Pending T004 Teacher/Foundation review; not currently granted by Foundation |

The existing `ActorContext.permissions` is a server-computed string list; the type itself does not define these proposed write permissions. Student and Teacher must not treat proposal strings as authorization until the Teacher's trusted middleware issues the reviewed capability after authentication.

## T003 — Internal service proposals and consistency review

The responsibility direction below is decided in the Student Spec and handoff documents. The exact signatures/capability strings remain proposals for T004 review.

### Teacher-authorized leader transfer proposal

```ts
interface TransferTeamLeaderInput {
  sessionId: UUID;
  teamId: UUID;
  successorParticipantId: UUID;
  requestId: string;
}

interface StudentTeamAdministrationService {
  transferLeaderByTeacher(
    input: TransferTeamLeaderInput,
    actor: TeacherScopedActorContext,
  ): TeamLeaderView; // synchronous proposal
}
```

Student verifies a trusted Teacher ActorContext, matching Session scope and the proposed `team:leader:transfer` capability; it then validates the successor's membership in the specified Team and Session and atomically updates the canonical leader assignment. Teacher owns the authenticated operation entry point and UI; Teacher does not write SQLite directly.

Proposed error mapping, from `contracts/internal-services.md`:

| Condition | Proposed error |
|---|---|
| Missing trusted context | `401 UNAUTHENTICATED` |
| Missing proposed capability or Session mismatch | `403 FORBIDDEN` |
| Missing Session or successor | `404 SESSION_NOT_FOUND` / `TARGET_NOT_FOUND` |
| Invalid/stale transfer or uniqueness conflict | `409 LEADER_TRANSFER_REJECTED` / `STALE_STATE` |
| Unexpected failure | Safe `500 INTERNAL_ERROR`; no credential material |

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

1. Whether `team:leader:transfer` and `round:end` are the accepted capability names and how trusted Teacher middleware supplies them.
2. Teacher's call to `transferLeaderByTeacher(...)` and the proposed input, result and error mapping.
3. Teacher's single call to `StudentTrustedEndCoordinator.endRound(...)`.
4. Synchronous `WinnerResolver(roundId): Result | null` execution in Foundation's existing `BEGIN IMMEDIATE` transaction and shared connection ownership.
5. No-winner Result handling, rollback/no-broadcast behavior, and composition-root wiring without a circular dependency.

T004 remains unchecked in `specs/002-student-feature/tasks.md`. These are internal integration proposals; no Foundation public API, DTO or Socket.IO contract is being changed by T001–T003.
