# Tasks: Shared Foundation

**Input**: Design documents from `/specs/001-shared-foundation/`

**Prerequisites**: `plan.md` and `spec.md`; supporting design: `research.md`, `data-model.md`, `quickstart.md`, and `contracts/`.

**Tests**: Included because the project Constitution requires normal and abnormal automated coverage for important functionality, plus manual operation checks. Tests verify Foundation boundaries; they do not implement Teacher or Student business workflows.

**Organization**: Tasks follow the three user stories in `spec.md`. Setup and foundational work unblock the story phases; US1 and US2 can then proceed independently, while US3 relies on the shared data/state foundation.

## Format: `[ID] [P?] [Story] Description`

- `[P]` marks work that can proceed in parallel because it touches separate files and has no unmet dependency.
- Story labels map to `spec.md` user stories. Setup, foundational, and polish tasks omit story labels.
- Every task names the files it creates or changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish one repository workspace with one web application, one server, and shared contracts.

- [X] T001 Define root npm workspaces, shared TypeScript configuration, and development scripts in `package.json`, `tsconfig.base.json`, and `package-lock.json`.
- [X] T002 [P] Scaffold the single React, TypeScript, Vite, React Router, and Tailwind web workspace in `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, and `apps/web/src/main.tsx`.
- [X] T003 [P] Scaffold the Express and Socket.IO server workspace and SQLite configuration entry points in `apps/server/package.json`, `apps/server/tsconfig.json`, and `apps/server/src/app.ts`.
- [X] T004 [P] Scaffold the framework-independent shared contracts workspace and package exports in `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, and `packages/contracts/src/index.ts`.
- [X] T005 Configure Vitest, Supertest, and Socket.IO client test environments and root test scripts in `vitest.config.ts`, `tests/setup.ts`, and `package.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provide shared infrastructure used by every story without implementing role-specific business workflows.

- [X] T006 Create environment parsing, SQLite connection lifecycle, and migration runner in `apps/server/src/config/env.ts`, `apps/server/src/persistence/database.ts`, and `apps/server/src/persistence/migrate.ts`.
- [X] T007 [P] Define shared entity identifiers, enums, DTO shapes, and request/response types from `data-model.md` and the contracts in `packages/contracts/src/domain.ts` and `packages/contracts/src/http.ts`.
- [X] T008 [P] Define the shared `ApiError`, error envelope, and server-verified `ActorContext` contract in `packages/contracts/src/errors.ts` and `packages/contracts/src/identity.ts`.
- [X] T009 Implement Express router mounting, request validation/error conversion boundaries, and server-side ActorContext injection seam in `apps/server/src/api/router.ts`, `apps/server/src/api/middleware/validate.ts`, `apps/server/src/api/middleware/actor-context.ts`, and `apps/server/src/errors/error-handler.ts`.
- [X] T010 Implement Socket.IO server attachment, server-managed session room naming, and event payload validation boundary in `apps/server/src/realtime/socket-server.ts`, `apps/server/src/realtime/session-room.ts`, and `packages/contracts/src/realtime.ts`.
- [X] T011 Add isolated temporary SQLite setup and teardown helpers for persistence and integration checks in `tests/helpers/sqlite.ts` and `tests/setup.ts`.

**Checkpoint**: The workspace, shared contracts, API/error boundary, realtime boundary, and test infrastructure are available. No Teacher or Student business feature is implemented.

---

## Phase 3: User Story 1 - 進入共用系統 (Priority: P1) 🎯 MVP

**Goal**: Provide the shared homepage, approved routes, shared layout, and placeholders in the single application.

**Independent Test**: Open `/`, follow both role links, then directly open each of the four role routes. Confirm the matching path loads a placeholder and no login, enrollment, management, or answer workflow is invoked. Open an unknown path and confirm the common not-found behavior.

### Tests for User Story 1

- [X] T012 [P] [US1] Add route rendering and navigation tests for the homepage and five approved paths in `apps/web/src/app/router.test.tsx`.
- [X] T013 [P] [US1] Add tests for role placeholders and unknown-route handling in `apps/web/src/pages/placeholders.test.tsx` and `apps/web/src/pages/not-found.test.tsx`.

### Implementation for User Story 1

- [X] T014 [US1] Configure the shared React Router with `/`, `/teacher/login`, `/teacher/dashboard`, `/student/join`, and `/student/session/:sessionId` in `apps/web/src/app/router.tsx` and `apps/web/src/app/App.tsx`.
- [X] T015 [P] [US1] Implement the shared application layout, navigation shell, and accessible role entry links in `apps/web/src/components/AppLayout.tsx`, `apps/web/src/components/RoleNavigation.tsx`, and `apps/web/src/styles.css`.
- [X] T016 [US1] Implement the shared homepage and role-specific placeholder pages without business actions in `apps/web/src/pages/HomePage.tsx`, `apps/web/src/pages/TeacherLoginPlaceholder.tsx`, `apps/web/src/pages/TeacherDashboardPlaceholder.tsx`, `apps/web/src/pages/StudentJoinPlaceholder.tsx`, and `apps/web/src/pages/StudentSessionPlaceholder.tsx`.
- [X] T017 [US1] Implement the common unknown-route page and connect it to the router in `apps/web/src/pages/NotFoundPage.tsx` and `apps/web/src/app/router.tsx`.
- [X] T018 [US1] Verify navigation, direct route loading, placeholders, and unknown-route handling in `tests/manual/foundation-routes.md`.

**Checkpoint**: US1 can be demonstrated on its own through the shared web app and route test suite.

---

## Phase 4: User Story 2 - 共享活動與題目概念 (Priority: P1)

**Goal**: Persist and validate the shared Session, Round, Question, Blank, QuestionGroup, Team, Participant, Submission, SubmissionAnswer, and Result relationships.

**Independent Test**: Create a Session with no Teams or Rounds; add a Question with zero and multiple Blanks; create empty and populated QuestionGroups; verify an empty QuestionGroup may be stored but cannot be a Round target, Domain Validator accepts valid relationships and rejects invalid ones, cross-Session Round targets are rejected, Round target XOR holds, and reopen creates a distinct Round; verify Team/Round Session mismatch, a Blank outside the Round target, and a Result winner from another Round are rejected; verify one Team cannot have two effective Submissions in one Round, acceptedOrder is persisted and unique per Round but supplied by the trusted Student backend, and a completed new Round replaces the prior Result atomically.

### Tests for User Story 2

- [X] T019 [P] [US2] Add SQLite tests for empty Session relations, Question 0..* Blanks, empty and populated QuestionGroups (empty groups remain storable but are invalid Round targets), same-Session Round targets/current Round, and Round target XOR, plus normal/abnormal Domain Validator unit tests in `tests/integration/data-model.test.ts` and `tests/unit/model-validation.test.ts`.
- [X] T020 [P] [US2] Add persistence tests for Team/Round same-Session enforcement and uniqueness, SubmissionAnswer Blank membership in the Round target, Result winner belonging to its Round, acceptedOrder persistence and per-Round uniqueness (generated by the trusted Student backend, never accepted as client authority), ordered answer-to-Blank links, and target Result replacement in `tests/integration/submission-result.test.ts`.

### Implementation for User Story 2

- [X] T021 [US2] Create SQLite migrations for the nine core entities plus SubmissionAnswer, nullable same-Session current Round, scoped composite foreign keys for Round targets/QuestionGroup membership/Result winner, same-Session Submission and target-Blank triggers, empty QuestionGroup target rejection, Round target XOR, allowed phases, and uniqueness constraints in `apps/server/src/persistence/migrations/001-foundation.sql`.
- [X] T022 [US2] Implement repositories for Session, Round, Question, Blank, QuestionGroup, Team, Participant, Submission, SubmissionAnswer, and Result in `apps/server/src/persistence/repositories/`.
- [X] T023 [US2] Implement normal/abnormal Domain Validation for same-Session Round targets, current Round, Team/Round pairs, Blank membership in the Round target, Result winner/Round matching, Question/Blank relationships, empty QuestionGroup target rejection (while allowing incomplete empty groups to persist), and the exactly-one Round target rule in `apps/server/src/modules/sessions/domain/model-validation.ts`.
- [X] T024 [US2] Implement transaction boundaries for Round creation in Waiting, same-Session integrity checks, session current-Round/version updates, Team/Round uniqueness, acceptedOrder persistence constraints, and atomic Ended + current-Result persistence when supplied a winning Submission by its owning Feature in `apps/server/src/modules/sessions/application/foundation-transactions.ts`; do not generate acceptedOrder, calculate correctness, rank submissions or determine the winner.
- [X] T025 [US2] Add persistence integration coverage for composite foreign keys, same-Session triggers, zero-Blank Questions, empty QuestionGroup target rejection, invalid Round targets, cross-target Blank answers, mismatched Result winners, duplicate Team/Round submissions, Ended/result atomicity, and rollback in `tests/integration/foundation-persistence.test.ts`.
- [X] T026 [US2] Verify model examples and storage behavior against the independent acceptance criteria in `tests/manual/foundation-data-model.md`.

**Checkpoint**: US2 independently demonstrates the confirmed data semantics and database constraints without Excel parsing or student submission workflows.

---

## Phase 5: User Story 3 - 共用活動階段與模組契約 (Priority: P2)

**Goal**: Expose the planned common read contracts and ensure authoritative Waiting/Active/Ended state is shared and synchronized, including reconnect recovery.

**Independent Test**: With test-only authorized actors, verify no-Round state is Waiting with null current Round/target and consistent changedAt; current-target is `{data:null}` and results is empty. Verify anonymous code lookup returns only the summary and throttles with HTTP 429 without creating membership. In Waiting, a verified Teacher with preview permission can read target content while a Participant is denied with no content; in Active, the Participant can read it; socket snapshots never include question content. Exercise target selection/reopen → Waiting, Start → Active, and End → Ended; verify Ended is broadcast only after the supplied Result commits, within 2 seconds, with latest snapshot on reconnect.

### Tests for User Story 3

- [ ] T027 [P] [US3] Add HTTP contract tests for anonymous pre-join lookup, minimal summary, configurable throttling/HTTP 429, no-Round response shapes, Waiting Teacher preview, Waiting/Ended Participant denial without content, Active Participant access, validation/error envelopes, protected-request authorization, and rejection of client-supplied actor/team identity in `tests/api/foundation-api.test.ts`.
- [ ] T028 [P] [US3] Add Socket.IO integration tests for session room isolation, unauthorized watch error/no room membership, snapshots containing no Question/Blank content, same-version broadcasts only after the Ended/Result transaction commits, reconnect snapshots, and the 2-second synchronization criterion in `tests/realtime/session-state.test.ts`.

### Implementation for User Story 3

- [ ] T029 [US3] Implement Session, state, current-target, and result read services using the repositories/shared DTOs; derive `changedAt` from Session `createdAt` or the current Round's persisted phase timestamp in `apps/server/src/modules/sessions/application/session-query-service.ts` and `apps/server/src/modules/sessions/application/session-state-service.ts`.
- [ ] T030 [US3] Implement the Foundation HTTP read endpoints and response/error mapping under `/api/v1`, including server validation and configurable rate limiting for the anonymous activity-code lookup, the `{data:null}` no-Round response, and backend ActorContext/phase checks for current-target access in `apps/server/src/modules/sessions/api/session-router.ts`, `apps/server/src/modules/sessions/api/session-controller.ts`, and `apps/server/src/api/middleware/activity-code-rate-limit.ts`.
- [ ] T031 [US3] Implement lifecycle domain transitions that create a Waiting Round on target selection/reopen, activate that same Round on Start, and use the shared transaction to commit Ended plus any owning-Feature-supplied Result before stateVersion publication in `apps/server/src/modules/sessions/application/session-lifecycle-service.ts`.
- [ ] T032 [US3] Implement authorized `session:watch`, phase/reference-only snapshots with no question content, post-commit `session:state:changed` broadcasts, and `session:error` handling in `apps/server/src/realtime/session-events.ts` and `apps/server/src/realtime/session-state-publisher.ts`.
- [ ] T033 [US3] Implement the web-side state snapshot client adapter with stale-version rejection and reconnect reconciliation in `apps/web/src/services/session-state-client.ts` and `packages/contracts/src/realtime.ts`.
- [ ] T034 [US3] Add manual validation for teacher Waiting preview, student Waiting denial/Active access, post-Ended result reads, no-Round responses, anonymous lookup throttling, 2-second shared-state timing, and unauthorized watches in `tests/manual/foundation-session-sync.md`.

**Checkpoint**: US3 provides shared contracts and lifecycle/synchronization primitives only; Teacher command UI, Student enrollment/submission, result determination, and role-specific authorization policy remain for later Features.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete Foundation increment and keep the implementation aligned with the approved design artifacts.

- [ ] T035 Document workspace startup, migrations, test commands, and the five-route walkthrough in `specs/001-shared-foundation/quickstart.md`.
- [ ] T036 [P] Add a requirement-to-task-to-test traceability checklist for FR-001–FR-019 and SC-001–SC-007 in `specs/001-shared-foundation/checklists/implementation-traceability.md`.
- [ ] T037 Reconcile the implemented module boundaries, data relationships, lifecycle, and socket event sequence with the three Foundation PlantUML diagrams in `diagrams/foundation-component.puml`, `diagrams/foundation-class.puml`, and `diagrams/foundation-sequence.puml`; regenerate corresponding PNGs with the required PlantUML CLI command if a diagram changes.
- [ ] T038 Run the root automated test suite, execute the quickstart and manual Foundation checks, and record actual commands, results, and any unverified limitation in `specs/001-shared-foundation/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately. T001 defines root workspace configuration; T002–T004 can proceed in parallel with one another after the workspace conventions are agreed. T005 follows the root workspace and package setup.
- **Foundational (Phase 2)**: Depends on setup. T007–T008 can proceed in parallel; server boundaries depend on the shared contract definitions. All foundational tasks block story work.
- **US1 and US2**: Both depend on Phase 2 and are independent of each other, so the two contributors can work in parallel on the web route surface and shared persistence/model surface.
- **US3**: Depends on the shared persistence and domain semantics from US2 and the API/realtime infrastructure from Phase 2. Within US3, query/lifecycle services precede endpoints and broadcasts.
- **Polish**: Depends on all three stories and their validation.

### Shared Contract Ownership and Handoff

- The Foundation owner defines the API, DTO and Socket.IO contract version and provides it to the Teacher Feature member for integration. This task records ownership and handoff, not a claim that the other member reviewed every item. Coordinate changes that cross module boundaries before adopting them.

### User Story Dependencies

- **US1 (P1)**: Depends only on Setup and Foundational; independently testable.
- **US2 (P1)**: Depends only on Setup and Foundational; independently testable. Can proceed in parallel with US1.
- **US3 (P2)**: Depends on US2 data model/repositories and Foundation API/realtime boundaries; does not add role-specific business flows.

### Parallel Opportunities

- Setup scaffold tasks T002–T004 touch distinct workspace files and can run in parallel after T001 workspace conventions.
- Shared contract definitions T007 and T008 touch separate files and can run in parallel.
- US1 route tests and placeholder tests (T012–T013) can be authored in parallel; layout and page work (T015–T016) can be split by files once router shape is agreed.
- US2 constraint and submission/result tests (T019–T020) can be authored in parallel.
- US1 and US2 can be assigned to different contributors after Phase 2.
- US3 HTTP and realtime contract tests (T027–T028) can be authored in parallel.

## Implementation Strategy

### MVP First (US1)

1. Complete Setup and Foundational phases.
2. Complete US1 route skeleton and placeholders.
3. Independently validate the shared home, approved routes, and business-free placeholders.
4. Continue to US2 and US3 for a complete Foundation increment.

### Incremental Delivery

1. Setup + Foundational → one shared application and contracts ready.
2. US1 → navigable shared route skeleton.
3. US2 → shared data concepts and persistence constraints.
4. US3 → read contracts, lifecycle synchronization, and reconnect behavior.
5. Polish → cross-story verification and requirement traceability.

### Two-Contributor Strategy

1. Both contributors align on and complete the shared workspace and contracts in Setup/Foundational.
2. After the shared interfaces are stable, one contributor can take US1 (web route skeleton) while the other takes US2 (data model/persistence).
3. Work on US3 after the model, repository and shared state contract are available; coordinate changes to shared contracts and diagrams.

## Notes

- Tasks describe future implementation work; this Tasks stage does not execute them.
- `[P]` is reserved for tasks on distinct files with no dependency conflict.
- Every checkbox task has a sequential ID, uses the required format, and names its exact target file(s).
- Teacher authentication and management, Excel import/export, formal student enrollment, team-leader policy, collaborative editing, answer submission/ranking, CSV export, and full QuestionGroup workflows are out of scope for this Feature.

