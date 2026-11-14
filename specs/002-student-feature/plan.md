# Implementation Plan: Student Feature

**Branch**: `feature/student` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-student-feature/spec.md`

## Summary

Implement Student as a module in the existing React/Vite application and Express server. Reuse Foundation's Session, Team, Participant, Round, Submission, SubmissionAnswer and Result tables, repositories, ActorContext shape, protected reads, lifecycle state and state Socket.IO contract. Add Student-owned enrollment and opaque browser credentials, leader assignment/transfer, Team × Round drafts, submission orchestration, Student draft events, and a Student-only Ended result projection. Persist Student-only state with additive SQLite migrations. Serialize enrollment, edits, submissions and End through SQLite `BEGIN IMMEDIATE` transactions. To avoid the current winner-selection race, Foundation must expose a minimal internal lifecycle transaction seam that invokes the Student winner resolver while holding the same write transaction and publishes only after commit; this changes no public HTTP, DTO or Socket.IO contract.

## Technical Context

Student UI serializes acknowledged HTTP edits per Blank and feeds their committed changes into the existing DraftClient, alongside Socket snapshots/change/lock notifications. Focused or failed local input is preserved; pending writes or unresolved remote differences block submission. This uses the same DraftService and existing HTTP/Socket contracts.

Submission uses the transaction's persisted draft as answer authority. The unchanged Student request answers are compared to that draft for stale-screen detection. Successful submission advances the draft version and publishes the existing locked event only after Commit.

Draft retry persistence uses additive `003-student-draft-mutations.sql`: receipts are keyed by Team/Round/mutation ID, committed atomically with the draft edit, and reused across HTTP and Socket retries. Foundation entities and external contracts remain unchanged.

**Language/Version**: TypeScript; Node.js 22.12+ as established by Foundation.

**Primary Dependencies**: Existing React 19, React Router 7, Vite 7, Tailwind CSS 4, Express 5, Socket.IO 4, `better-sqlite3`, Vitest, Supertest and `socket.io-client`; add `cookie` as a direct server dependency for consistent Express/Socket.IO cookie parsing and serialization (already present transitively in the lockfile). Use existing `fetch` and state-client patterns.

**Storage**: Existing SQLite database and migration runner. Additive Student migration only; Foundation rows remain authoritative. Foreign keys are enabled on each connection. Student writes use synchronous `better-sqlite3` immediate transactions.

**Testing**: Vitest unit/domain tests; Supertest API tests; Socket.IO Client integration tests; temporary SQLite migration, persistence and concurrent-command tests; browser/manual checks using the existing Vite/Express same-origin proxy.

**Target Platform**: Windows local development and classroom Demo, plus Node.js environments supported by the existing workspace. No public deployment requirement.

**Project Type**: Existing single web application with one shared API/realtime server and shared Contracts workspace.

**Performance Goals**: Preserve Foundation's ≤2-second connected activity-state display requirement. Student draft change notifications should be emitted after persistence and delivered within 2 seconds on a normal local connection. No class-size throughput target is specified; SQLite write serialization is appropriate for the local Demo scale.

**Constraints**: No second frontend, database, or Socket.IO server. No student bearer credential in localStorage or logs. Cookie-authenticated mutations require exact allowed-Origin validation and session-bound CSRF protection, with one narrowly scoped bootstrap exception: the first enrollment for a Session cannot present a Student CSRF token before the server creates that Session's Participant binding and issues the token. That enrollment request MUST still have an exact allowed `Origin`; missing or disallowed Origin is rejected, and all identity, Session, Team and input validation remains server-side. An enrollment request for an already-bound Participant is not a bootstrap and requires the normal CSRF token. No other protected operation is exempt. The stateless HMAC CSRF signer key must be supplied through secure server configuration (`STUDENT_CSRF_SECRET`, minimum 32 random bytes), never committed or logged. Student clients never choose authoritative actor, Team, leader, acceptedOrder, result or room identifiers. Draft events must not extend or carry data in Foundation's state events. Teacher UI and business implementation remain out of scope.

**Scale/Scope**: One course activity application; dynamic question/group/blank counts; multiple Participants per Team; a single accepted Submission per Team/Round; one current leader per Team.

### Student leader failover (2026-11-14)

Use the shared Socket.IO server's live socket registry as the presence source across all phases. Each registered socket has a unique ID and a verified Student handshake scope. Count both activity and draft sockets and all tabs, rechecking current credential and membership when evaluating presence or publishing. Evaluate after disconnect and on a valid member connection or authorized re-subscription, so a Team can recover when no successor was initially online. Transport heartbeat detection still applies; add no application grace timer. A multi-process deployment would require shared presence and is outside this plan.

Record accepted join order for the current Team using the additive Student data model. In `BEGIN IMMEDIATE`, recheck current leader, scope and presence, select the earliest eligible online teammate and conditionally replace the same assignment. A candidate is an existing member of the same Team and Session with a live, currently authorized Student socket. Keep the existing assignment if there is no candidate. A newly online member can trigger reassessment of an offline current leader; a returning former leader never displaces an online current leader or reclaims the role by reconnecting alone. To distinguish an initial assignment from a detected disconnect, reassess on member arrival only when the current assignment has been observed offline by this process. Publish membership invalidation after commit, including pre-start handoff and, after T004, reviewed manual handoff. Failed writes leave the original assignment intact and emit no notice.

The browser refreshes `/me` on connection, reconnection and invalidation. A full F5 refresh may disconnect all of that Participant's sockets and trigger handoff while an eligible teammate is online. The Cookie restores the same Participant and Team; the role comes from the current assignment. Hide or disable submission while role refresh is unresolved. Serialize or supersede in-flight membership reads so a stale response cannot restore a prior role. Preserve the current draft. The submission service already rereads the leader within `BEGIN IMMEDIATE`; verify both transaction orders with failover, without reopening the same Team/Round submission.

OpenSpec/Teacher synchronization covers the behavior, the no-candidate and F5 cases, and common acceptance tests. Student owns the automatic path. T004 remains open for the Teacher manual-transfer and End interfaces, including manual versus automatic update ordering; no Teacher configuration, new Foundation permission or Foundation public contract change is planned.

## Constitution Check

### Initial gate

- **Requirements consistency**: Pass. Uses the clarified Student Spec and the agreed Student/Teacher responsibility split; no new product behavior is inferred from the teacher handoff guide.
- **Modularity**: Pass with an integration review gate. Student is an in-process module in the existing application. The two internal Teacher-facing services are documented as proposed interfaces and must be reviewed with the Teacher Feature member before cross-feature implementation.
- **Data and security**: Pass. Server-derived ActorContext, opaque HttpOnly cookie, Origin/CSRF checks, server-side membership/leader resolution, dynamic target validation, and no client-supplied acceptedOrder.
- **Quality**: Pass at planning level. The test plan includes normal, invalid, unauthorized, stale, duplicate, cross-Team/Session, reconnect and concurrent End/Submit cases. No tests are claimed as executed in this Plan stage.
- **Diagram First**: Pass when the three Plan-level `.puml` and generated PNG files are produced and inspected beside this Plan.
- **SpecKit phase discipline**: Pass. This Plan does not create `tasks.md` or implement application code.

### Post-design gate

The proposed contracts are additive Student contracts. The one required internal Foundation change is a transaction callback/service seam for winner resolution inside Foundation's existing End transaction. Existing Foundation HTTP/DTO/Socket.IO contracts remain unchanged. Current Foundation permissions include `session:read`, `session:watch`, `target:preview`, `target:read`, and `results:read`; they do not include Teacher write capabilities. This Plan proposes `team:leader:transfer` and `round:end` as new strings carried by the existing `ActorContext.permissions` array. They are not current Foundation permissions and Teacher authentication middleware must issue them only after authorization. The single End interface and both capability names need an explicit cross-feature review task; Tasks may be generated now, but affected implementation must wait until that review resolves. A static winner lookup followed by the current `endRound()` call is explicitly rejected because it leaves a submission race window.

## Architecture and Data Flow

1. Student uses Foundation's anonymous Activity Code lookup semantics, then a restricted Student join-options read to list only Team IDs/names. Lookup does not grant membership. First-time enrollment remains allowed after the Session first becomes Active, but only into a pre-existing Team; Student never creates Teams. Existing Participants cannot change Teams after that first Active transition.
2. Enrollment validates Activity Code/Session/Team, creates or reuses the browser credential, inserts the canonical Foundation Participant, binds that Participant to the browser credential for the Session, and elects a first Team leader in one immediate transaction.
3. Express middleware validates the opaque cookie digest and resolves the route's Session-scoped Participant and Team into trusted `ActorContext`, including Foundation's protected `/sessions/{sessionId}/current-target` read. The Student-only `student_session` cookie uses `Path=/` so the same-origin browser sends it to both `/api/v1/student` and `/socket.io`; only Student identity middleware/resolvers parse it. Socket.IO validates the exact handshake Origin; its `sessionId` is only a requested scope, and the server resolves a matching cookie-to-Participant mapping before creating ActorContext. The client never supplies identity or permission claims. Every state-changing HTTP operation requires exact allowed-Origin validation. The first enrollment that creates a Participant binding in the requested Session is the sole CSRF bootstrap exception because no Session-bound token exists yet; it rejects missing/disallowed Origin and still validates all inputs and relationships server-side. Once the Session binding exists, enrollment retries and all other protected mutations also require the normal session-bound CSRF token. Every state-changing Socket.IO operation requires exact Origin and the session-bound CSRF token.
4. During Active, Student reads target content through Foundation's existing protected current-target endpoint. Draft reads/writes use Student routes and Student-owned Socket.IO events. Every accepted edit is persisted/versioned before team-room broadcast.
5. Submission rechecks the authenticated Participant, current Team leader, current Round/Session, Active phase, target Blank set, completeness, duplicate constraint and draft lock inside one immediate transaction. The server assigns the next per-Round `acceptedOrder`, inserts canonical Foundation Submission rows and locks the draft before commit.
6. Teacher calls one Student-owned synchronous `StudentTrustedEndCoordinator.endRound(input, actorContext)` interface. The coordinator verifies the proposed `round:end` capability, then calls Foundation's synchronous internal lifecycle method with Student's synchronous winner resolver. Foundation starts one `BEGIN IMMEDIATE` transaction; the resolver selects the earliest accepted Submission from the same connection/transaction and returns `Result | null` without a Promise. Foundation persists Ended/Result/stateVersion atomically, then returns only after Commit. The existing Socket.IO state notification is dispatched asynchronously after Commit and is never awaited inside the SQLite transaction. Submit and End serialize on the same SQLite writer lock; a failure rolls back and does not dispatch a notification.
7. After Ended, Student's protected result projection joins the persisted Result to its winning Team and SubmissionAnswers. It returns only the winning Team name and that Team's successful answers, or a null winner.

## Project Structure

### Documentation (this feature)

```text
specs/002-student-feature/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── student-http-api.md
    ├── student-realtime.md
    └── internal-services.md
```

### Source Code (existing repository; planned locations)

```text
apps/server/src/
├── api/
│   ├── middleware/                 # cookie identity resolver, Origin/CSRF guards
│   └── student/                    # Student API router/controllers
├── modules/student/
│   ├── domain/                     # enrollment, membership, draft/answer validators
│   ├── application/                # identity, team, draft, submission, result services
│   │   ├── student-trusted-end-coordinator.ts  # single Teacher-facing internal End call
│   │   └── winner-resolver.ts                 # synchronous callback, Foundation Result candidate
│   ├── persistence/                # Student-only repositories and migration support
│   └── realtime/                   # Student draft event auth, rooms, publisher
└── modules/sessions/application/
    └── end-round-with-winner-resolver.ts       # Foundation-owned transaction port; no Student import

apps/web/src/
├── pages/                          # replace existing Student placeholders in place
├── modules/student/                # join, session shell, target editor, draft and result views
└── services/                       # Student HTTP and draft Socket.IO adapters

packages/contracts/src/
├── student.ts                      # Student DTOs and validators
└── student-realtime.ts             # additive Student draft event types/validators

tests/
├── api/student-*.test.ts
├── integration/student-*.test.ts
├── realtime/student-draft.test.ts
└── manual/student-feature.md
```

**Structure Decision**: Extend the existing `apps/web`, `apps/server`, `packages/contracts`, `tests` and migration runner. Keep Foundation entities authoritative. Student-specific tables store credentials, leader mapping, planned Team join order and drafts; canonical Participant/Submission/Result data remain in Foundation tables. The root composition injects one shared `Database` instance into the Student End coordinator, Student winner resolver and Foundation lifecycle transaction port; only the coordinator is called by Teacher. Foundation depends on the generic resolver callback shape, not the Student module, to keep dependencies acyclic.

## Design Gate Summary

- Foundation has no student enrollment, Cookie identity resolver, leader state, drafts, Student submission API, draft events or Student result projection; these are Student-owned additions, not existing capabilities.
- The Teacher handoff documents correctly assign transfer and winner responsibilities. The Plan names one Teacher-facing End coordinator and a leader-transfer service in [internal-services.md](contracts/internal-services.md); these signatures and new capability names are proposals for Teacher review, not existing Foundation grants or programmatically verified services.
- Foundation's existing End service accepts a preselected Result and publishes after its own transaction. The plan adds an internal resolver callback executed while that same `BEGIN IMMEDIATE` transaction is held; no Foundation public contract is changed.
- Session admission timing is now decided: first-time enrollment into an existing Team remains available after first Active; Team creation and post-start transfer remain disallowed. No Teacher admission-stop setting is added.

## Complexity Tracking

No Constitution exception is requested. The Foundation internal transaction seam is a necessary composition point for the clarified ownership rule and atomic End/Result behavior, not a second persistence or API layer.
