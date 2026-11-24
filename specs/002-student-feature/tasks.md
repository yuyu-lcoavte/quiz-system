---
description: "Dependency-ordered implementation tasks for Student Feature"
---

# Tasks: Student Feature

**Input**: Design documents from `/specs/002-student-feature/`

**Prerequisites**: `plan.md`, `spec.md`; supporting design in `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `diagrams/002-student-feature-*.puml`.

**Organization**: Tasks are staged by setup/gate, shared prerequisites, and the three P1 user stories. US2 is split into Draft and Submission increments because they have distinct acceptance checkpoints. UI work is grouped after service contracts are available, with every task mapped to its owning story.

**Execution rule**: All tasks start unchecked. Do not implement a task before its listed dependencies and review gates pass. Tests are TDD tasks: write the test first, verify it fails for the expected reason, then implement.

Active task accounting excludes the two Cancelled entries (T025/T026). Before Converge appended Phase 9, there were 64 active tasks, 59 complete and 5 open among 66 retained IDs. For current accounting, see Phase 9 and the latest dated verification below.

## Format: `- [ ] [TaskID] [P?] [Story?] Description`

- **[P]**: The task can run in parallel without editing the same files or depending on unfinished work.
- **[Story]**: User Story label from `spec.md`; Setup and Foundational tasks have no story label.
- Every task names its output or test file path.

## Phase 1: Setup and Cross-Module Review Gate

**Purpose**: Verify reuse of Foundation and record the architecture decision separately from interface proposals. T004 is a hard gate for all tasks explicitly marked as blocked by review.

- [X] T001 [P] Verify the existing workspace, Node/npm requirements, Vitest/Supertest/Socket.IO Client tools, Express composition root, `ActorContext`, SQLite `DatabaseManager`, Foundation repositories, and Socket.IO server; record actual source paths and reuse boundaries in `docs/integration/student-feature-review-gate.md`.
- [X] T002 Record the implemented Foundation capabilities (`session:read`, `session:watch`, `target:preview`, `target:read`, `results:read`) and record `round:end` as the proposed End capability, in `docs/integration/student-feature-review-gate.md` after T001 creates the review record.
- [X] T003 Document and review the single `StudentTrustedEndCoordinator.endRound(...)` call, synchronous `WinnerResolver(roundId): Result | null` callback, shared SQLite instance/transaction ownership, no-winner behavior, and rollback/no-broadcast behavior in `docs/integration/student-feature-review-gate.md`.
- [X] T004 Obtain Teacher and Foundation owner review of the interfaces and permission names; record accepted signatures/capabilities, responsibility split and reviewer/date in `docs/integration/student-teacher-decisions.md` section 5. **Design Gate approved 2026-11-20** by Teacher and Student/Foundation. This accepts the interface/security design, not implementation acceptance. T044 is independently verified; T067/T068 now supply real-path security/race evidence, while original T041/T045 checkboxes await explicit owner closeout.

**Gate boundary**: The architecture owner has decided the responsibility direction. T004 review covers the Teacher End entry, `round:end` authorization, and the Foundation same-transaction callback; it does not re-open the decided Student/Teacher/Foundation responsibility split. No new Foundation public HTTP, DTO, or Socket.IO contract is authorized here.

---

## Phase 2: Student Foundational Infrastructure

**Purpose**: Add Student-owned persistence and safe module seams on the existing Foundation server. This phase does not implement enrollment, draft, submission, or Teacher business flows.

- [X] T005 [P] Add isolated SQLite tests for Student migration constraints and credential/draft persistence in `tests/persistence/student-migration.test.ts`; verify the test database is separate from the normal development database.
- [X] T006 Add the additive Student migration in `apps/server/src/persistence/migrations/002-student-feature.sql`. Preserve these `data-model.md` constraints: `tokenHash` is unique and “never the raw cookie value”; `(credentialId, sessionId)` is the primary key and `(sessionId, participantId)` is unique; `teamId` is the TeamLeader primary key and its leader Participant “must be a member of teamId”; `(teamId, roundId)` is the TeamRoundDraft primary key; `version` is a “non-negative integer”; `status` is `editable | locked`; `(teamId, roundId, blankId)` is the draft-answer primary key and `revision` is a “positive integer”. Enforce foreign keys, same-Session membership, and locked-draft immutability with SQLite constraints/triggers where possible and document domain-only checks in `specs/002-student-feature/data-model.md`.
- [X] T007 [P] After T006, implement Student credential, credential-to-Participant, and TeamLeader repositories using the existing `better-sqlite3` connection in `apps/server/src/modules/student/persistence/identity-repository.ts` and `apps/server/src/modules/student/persistence/team-leader-repository.ts`.
- [X] T008 [P] After T006, implement TeamRoundDraft and TeamRoundDraftAnswer repositories with transaction-bound read/upsert/lock operations in `apps/server/src/modules/student/persistence/draft-repository.ts`.
- [X] T009 Add Student identity and error DTOs, request validators, and exports without changing Foundation DTOs in `packages/contracts/src/student.ts` and `packages/contracts/src/index.ts`.
- [X] T010 Add Student draft event payload types and runtime validators for the existing proposal event names in `packages/contracts/src/student-realtime.ts` and `packages/contracts/src/index.ts`, after T009 so the shared exports index is not edited concurrently.
- [X] T011 Write tests for opaque-cookie ActorContext resolution, Session scope mismatch, missing/expired/revoked credential, and production rejection of client-supplied identity in `tests/api/student-identity-middleware.test.ts`.
- [X] T012 Implement the Student cookie resolver and trusted ActorContext adapter in `apps/server/src/modules/student/application/student-identity-service.ts` and `apps/server/src/api/middleware/student-identity.ts`; map the cookie to the canonical Participant/Team for the route Session and fail closed when no server mapping exists.
- [X] T013 Write Origin and CSRF tests covering wrong HTTP/Socket.IO Origin, absent/expired/wrong-Session token, valid token, and socket mutation token validation in `tests/api/student-csrf.test.ts`; verify protected mutations reject missing tokens and an invalid Origin even when other fields are valid.
- [X] T014 Implement exact-Origin and HMAC CSRF middleware in `apps/server/src/api/middleware/student-origin.ts` and `apps/server/src/api/middleware/student-csrf.ts`; require `STUDENT_CSRF_SECRET`, use `Cache-Control: no-store` for token reads, and never log or return the cookie secret.
- [X] T015 Create the Student HTTP router, shared envelope/error mapping, and composition-root registration in `apps/server/src/api/student/student-router.ts` and `apps/server/src/app.ts`; do not add test-only production routes.
- [X] T016 Create the Student Socket.IO handler registration, payload validation seam, and server-derived Team/Round room helper in `apps/server/src/modules/student/realtime/student-draft-socket.ts` and `apps/server/src/modules/student/realtime/student-draft-room.ts`; do not yet add draft business event behavior.

**Checkpoint**: Student tables migrate in an isolated test database; identity and CSRF seams fail closed; no Foundation public contract or Teacher UI has changed.

---

## Phase 3: User Story 1 — Join an Activity (P1)

**Goal**: Join an existing Session Team, establish a recoverable server identity, elect the first leader atomically, and preserve the decided late-join/team-change rules.

**Independent Test**: Valid/invalid Activity Codes and Team selections; concurrent first joins yield at most one leader; same-browser refresh restores the same Participant; late first-time enrollment into an existing Team works after first Active; existing Participants cannot transfer after first Active; forged identity and cross-Session access fail.

### Tests for User Story 1

- [X] T017 [P] [US1] Add join-options contract tests for valid/invalid Activity Code, minimal Team list, rate limiting, and no membership grant in `tests/api/student-join-options.test.ts`.
- [X] T018 [P] [US1] Add enrollment integration tests for the CSRF bootstrap: a first Session binding succeeds with an allowed Origin and no Student CSRF token, while missing, `null`, malformed or disallowed Origin is rejected without creating membership; verify an already-bound idempotent retry requires a valid session-bound CSRF token. Also test existing-Team validation, parallel first-member joins, late first-time join after first Active, no Team creation, and Session isolation in `tests/integration/student-enrollment.test.ts`.
- [X] T019 [P] [US1] Add identity recovery tests for `student_session` cookie attributes (`Path=/`, HttpOnly, SameSite=Lax, Secure on production HTTPS), no bearer value in JSON/logs, refresh recovery, expiry/revocation, and no restore by display name in `tests/api/student-identity.test.ts`. The original reconnect test reflects the prior baseline; T062 updates the role assertions for the new policy.
- [X] T020 [P] [US1] Add team-change tests for pre-Active change, required leader handoff, invalid successor, rollback, and rejection after first Active in `tests/integration/student-team-change.test.ts`.

### Implementation for User Story 1

- [X] T021 [US1] Implement restricted join-options service and `GET /api/v1/student/join-options/{activityCode}` in `apps/server/src/modules/student/application/join-options-service.ts` and `apps/server/src/api/student/join-options-controller.ts`; reuse Foundation `SessionQueryService`, expose only phase and existing Team IDs/names, and apply configurable throttling.
- [X] T022 [US1] Implement atomic enrollment and initial leader election in `apps/server/src/modules/student/application/enrollment-service.ts`; validate that the selected Team belongs to the Session, create/reuse canonical Participant and credential mapping, and insert TeamLeader only if absent. Permit a first-time join after first Active only into an existing Team; never create a Team or move an existing Participant through enrollment.
- [X] T023 [US1] Implement `POST /api/v1/student/sessions/{sessionId}/enrollments`, `GET .../me`, and `GET .../csrf-token` controllers in `apps/server/src/api/student/enrollment-controller.ts` and `apps/server/src/api/student/student-router.ts`; allow the no-token bootstrap only when no Participant binding exists for that credential/Session, strictly require an allowed Origin and full server validation, require CSRF for an already-bound retry, return server-derived membership/leader status, set only the opaque `student_session` cookie with `Path=/`, HttpOnly, SameSite=Lax and Secure on production HTTPS, and preserve existing active-cookie CSRF validity across tabs.
- [X] T024 [US1] Implement the Student-requested pre-start team-change transaction in `apps/server/src/modules/student/application/team-change-service.ts` and `apps/server/src/api/student/team-change-controller.ts`; clear the leader only when the mover is the sole member, otherwise assign the earliest online teammate or flag the earliest remaining teammate for online recheck. Reject changes after first Active.
- [ ] T025 [US1] **Cancelled / 不適用** — Team decision removed Teacher-assigned leadership. Excluded from active task counts.
- [ ] T026 [US1] **Cancelled / 不適用** — Team decision removed Teacher-assigned leadership. Excluded from active task counts.

---

## Phase 4: User Story 2 — Shared Team/Round Draft Editing (P1, Draft increment)

**Goal**: Persist and synchronize one dynamic draft per Team/Round, resolve same-Blank conflicts by server acceptance order, and recover after refresh/reconnect.

**Independent Test**: Two members of one Team see the same committed versions and values; stale edits cannot roll state backward; another Team/Session cannot observe the draft; invalid phase/Blank/CSRF or locked draft is rejected; reconnect returns the latest snapshot.

### Tests for User Story 2 Drafts

- [X] T027 [P] [US2] Add draft HTTP and Socket.IO tests for browser transmission of the `student_session` cookie to `/socket.io`, authorized handshake identity derived from that cookie, missing/expired/unmapped cookie rejection, wrong-Origin rejection, forged client identity rejection, membership, current Active Round, dynamic Blank ownership, Origin/CSRF, stale versions, idempotent mutation IDs, locked-draft rejection, and committed edit delivery to a second authorized client within 2 seconds under normal local connection in `tests/api/student-draft.test.ts` and `tests/realtime/student-draft.test.ts`.
- [X] T028 [P] [US2] Add persistence/transaction tests for one Team×Round draft, one current value per Blank, monotonic version/revision, same-Blank last-server-commit-wins, and no cross-Session relation in `tests/integration/student-draft-persistence.test.ts`.

### Implementation for User Story 2 Drafts

- [X] T029 [US2] Implement the draft application service in `apps/server/src/modules/student/application/draft-service.ts`; derive Team from ActorContext, require the current Active Round and target Blank, commit each edit/version before emitting, and reject Waiting, Ended, stale target, or locked-draft mutations.
- [X] T030 [US2] Implement draft snapshot and answer-edit endpoints in `apps/server/src/api/student/draft-controller.ts` and `apps/server/src/api/student/student-router.ts`; reuse the same DraftService as Socket.IO and return the authenticated Team's snapshot only.
- [X] T031 [US2] Implement `student:draft:watch`, `student:draft:edit`, `student:draft:snapshot`, `student:draft:changed`, and safe error handling in `apps/server/src/modules/student/realtime/student-draft-socket.ts`; validate handshake Origin, resolve the `student_session` cookie to server-trusted Participant/Team, reject missing or unauthorized identity before room join, join only the server-computed Team/Round room, and publish state changes only after database commit.
- [X] T032 [US2] Implement version-aware draft HTTP/Socket client reconciliation and reconnect snapshot recovery in `apps/web/src/modules/student/draft-client.ts`; ignore non-increasing versions and never treat client timestamps or `baseVersion` as authoritative order.

---

## Phase 5: User Story 2 — Validate and Submit Answers (P1, Submission increment)

**Goal**: Permit only the verified Team leader to submit a complete current target once per Round, assign acceptedOrder on the server, and lock the shared draft atomically.

**Independent Test**: Active leader submission persists one canonical Submission and all answers with server-generated order; non-leader, incomplete/blank, empty target, cross-Session, stale Round, Waiting/Ended, forged identity/order, duplicate, and competing requests are rejected without partial writes; a failed transaction leaves the draft editable.

### Tests for User Story 2 Submission

- [X] T033 [P] [US2] Add submission contract/domain tests for leader-only authorization, Active/current target, exact Blank coverage, non-whitespace values, empty Question/QuestionGroup target, forged fields, and same-Session membership in `tests/api/student-submission.test.ts`.
- [X] T034 [P] [US2] Add SQLite transaction tests for unique Team/Round Submission, unique acceptedOrder, concurrent submissions, rollback on insert/lock failure, and Submission+draft lock atomicity in `tests/integration/student-submission-transaction.test.ts`.

### Implementation for User Story 2 Submission

- [X] T035 [US2] Implement target completeness and leader validators in `apps/server/src/modules/student/domain/submission-validation.ts`; derive the required Blank set from the current Question or QuestionGroup and reject any empty/non-whitespace-incomplete target.
- [X] T036 [US2] Implement the submission transaction in `apps/server/src/modules/student/application/submission-service.ts`; under `BEGIN IMMEDIATE`, revalidate ActorContext, leader, Session/current Active Round, exact target Blank set and duplicate state, assign `MAX(accepted_order)+1`, write canonical Foundation Submission/SubmissionAnswers, and lock TeamRoundDraft before commit.
- [X] T037 [US2] Implement `POST /api/v1/student/sessions/{sessionId}/rounds/{roundId}/submissions` in `apps/server/src/api/student/submission-controller.ts`; reject client-supplied Team, Participant, role, acceptedOrder, Submission ID, or timestamp as authority and return the submitting Team's accepted outcome only.
- [X] T038 [US2] Add post-commit `student:draft:locked` publication and tests in `apps/server/src/modules/student/realtime/student-draft-socket.ts` and `tests/integration/student-submission-transaction.test.ts`; failed or rolled-back submission must neither lock nor notify.

---

## Phase 6: User Story 3 — State, Winner and Published Results (P1)

**Goal**: Reuse Foundation activity snapshots and provide the authorized Student result projection after End, with winner selection serialized against Submission.

**Independent Test**: Waiting/Active/Ended and reconnect display the latest Foundation `stateVersion`; no result is available before Ended; after Ended only winning Team name/answers or `winner: null` are returned. Submit-first is included in winner selection; End-first rejects later submission; rollback emits no state event.

### Tests for User Story 3

- [X] T039 [P] [US3] Add state-client tests for Session matching, stale `stateVersion`, reconnect/resubscribe authoritative snapshot, no answer data in Foundation events, and displaying a normal-connection state change within 2 seconds in `tests/web/student-session-state.test.ts`.
- [X] T040 [P] [US3] Add result projection tests for Ended gating, winner Team/answer allowlist, no loser/acceptedOrder leakage, new Round isolation, and no-winner projection in `tests/api/student-result.test.ts`.
- [ ] T041 [US3] Add Submit-vs-End transaction race tests for both lock orders, result replacement, no Submission, injected resolver failure, rollback, and post-commit-only broadcast in `tests/integration/student-end-race.test.ts`. Student-side scenarios can run against a test-only port. Completion requires T004 and validation against the real T044/T045 path.

  **T044 verification (historical):** Tests inject the formal `SessionLifecycleService` Port into the existing Coordinator, replacing the mock End transaction. Independent scope/locking/resolver/persistence/publication tests pass. **Current T070 review:** T067/T068 subsequently cover real composition, mixed Cookies, Student-failure isolation and formal HTTP races. No additional missing technical case was identified for T041; its checkbox remains open for explicit owner closeout, as requested.

### Implementation for User Story 3

- [X] T042 [US3] Integrate the existing Foundation `SessionStateClient` into the Student activity route in `apps/web/src/modules/student/student-session-state.ts`; display authoritative state and Round reference, ignore stale versions, and resubscribe/reconcile on reconnect without duplicating Foundation Socket.IO events.
- [X] T043 [US3] Implement the synchronous Student winner resolver over canonical accepted Submissions in `apps/server/src/modules/student/application/winner-resolver.ts`; order by persisted `accepted_order`, construct the canonical Foundation Result candidate, and return `null` when no valid Submission exists without writing Result or publishing state.
- [X] T044 [US3] After T004 (design approved 2026-11-20), add the Foundation-owned End input and synchronous winner callback Port in `apps/server/src/modules/sessions/application/foundation-transactions.ts` and `apps/server/src/modules/sessions/application/session-lifecycle-service.ts`. Use the same Database and one outer `BEGIN IMMEDIATE`; verify Session/current Round/Active/version before resolver execution. Persist Ended/stateVersion/Result atomically, clear the prior logical-target Result on no winner, then publish after commit. Catch/log notification failures and return the committed snapshot successfully. Keep Foundation public contracts compatible. **Verified independently; evidence in Quickstart. T045 wiring exists; its original checkbox awaits explicit owner closeout after T067/T068 evidence.**
- [ ] T045 [US3] After T004, T043 and T044, reuse the existing synchronous `StudentTrustedEndCoordinator` in `apps/server/src/modules/student/application/student-trusted-end-coordinator.ts`, align its Port type to the Foundation-owned input, and complete production composition in `apps/server/src/app.ts` and `apps/server/src/api/router.ts`. Share Database/lifecycle/publisher/resolver, mount the Teacher router after dependencies are ready, and remove Student-to-Teacher watch fallback on identity failure. Verify mixed Cookies, expired Student identity, invalid Origin and trusted Teacher scope/capability through Teacher adapters. Teacher owns Cookie/Origin/CSRF and Teacher Socket authorization; formal security tests remain required.

  **2026-11-21 partial verification (historical snapshot):** Shared service composition, the canonical Foundation Port type, the optional `createTeacherRouter(TeacherServiceDependencies)` factory, `startServer` adapter forwarding and fail-closed Student Socket resolution are implemented. `student-end-composition.test.ts` and `student-socket-auth.test.ts` pass 16 targeted tests, including committed Result visibility and real Student watch. Controlled Teacher adapters verify the seam only. At that date, real Teacher adapters were absent locally. **Current T070 review:** real adapters are now installed by `main.ts`; T067/T068 supply the required security and composed End evidence. No missing technical integration case was identified for T045. Preserve `[ ]` pending explicit owner closeout; this review does not mark T041 or T059–T061 complete.
- [X] T046 [US3] Implement the Student-only Ended result projection and route in `apps/server/src/modules/student/application/student-result-service.ts` and `apps/server/src/api/student/result-controller.ts`; require enrolled Participant context and return only winning Team name/answers or `winner: null`.

---

## Phase 7: Student UI Integration (US1, US2, US3)

**Purpose**: Fill the existing Foundation Student routes and layout after their server contracts are available. Keep UI tasks attached to the corresponding user story; no Teacher UI is included.

- [X] T047 [P] [US1] Add responsive and accessible interaction tests for join, membership, late enrollment, validation errors, and failed identity recovery in `tests/web/student-join-pages.test.tsx`.
- [X] T048 [P] [US2] Add responsive and accessible interaction tests for dynamic Blank/QuestionGroup rendering, collaborative draft state, leader-only submit controls, validation errors, and locked state in `tests/web/student-activity-draft.test.tsx`.
- [X] T049 [P] [US3] Add responsive and accessible interaction tests for Waiting/Ended restrictions, reconnect state, winner/no-winner projection, and result privacy in `tests/web/student-result-state.test.tsx`.
- [X] T050 [US1] Replace the existing `/student/join` placeholder with Activity Code lookup, restricted join options, validation errors, and existing-Team selection in `apps/web/src/pages/StudentJoinPlaceholder.tsx`.
- [X] T051 [US1] Implement Student enrollment/recovery client and membership view (Team, display name, leader status) in `apps/web/src/modules/student/student-identity-client.ts` and `apps/web/src/modules/student/StudentMembershipPanel.tsx`; never expose or persist the opaque cookie in JavaScript storage.

  **FR-005 follow-up (T047/T051):** The original UI acceptance covered join and recovery but missed the pre-start team-change control. `StudentTeamChangeForm.tsx` connects the existing authenticated membership read and team-change mutation; `tests/web/student-team-change.test.tsx` covers the control, handoff, and rejections. Windows browser verification remains pending under T061.

  **Automatic team-change handoff (T020/T024/T047/T051):** Cover vacant and occupied destinations, ordered online selection, offline assignment and recheck, concurrent moves and rollback without notification. The form sends only the destination Team. Windows verification remains pending under T061.
- [X] T052 [US2] Implement a data-driven target editor for one Question with multiple Blanks and a QuestionGroup with multiple Questions in `apps/web/src/modules/student/StudentTargetEditor.tsx`; render controls from received Blank data and never parse Excel or hard-code counts.
- [X] T053 [US2] Implement shared draft view, leader-only submit control, pending/success/failure feedback, and read-only locked state in `apps/web/src/modules/student/StudentDraftPanel.tsx` and `apps/web/src/modules/student/StudentSubmissionControls.tsx`.
- [X] T054 [US3] Replace the existing `/student/session/:sessionId` placeholder with Waiting/Active/Ended panels, Round changes, and connection recovery messaging in `apps/web/src/pages/StudentSessionPlaceholder.tsx`; render the Student result panel only after Ended.

---

## Phase 8: Polish and Integrated Acceptance

**Purpose**: Complete traceability and operational evidence without claiming manual tests that have not been run.

- [X] T055 [P] Update the Windows Student Feature validation steps and expected limitations in `tests/manual/student-feature.md`; include cookie/CSRF inspection, two-member shared draft, late join, automatic leader succession, submission, End race, reconnect, isolation, and authenticated Teacher workflow.
- [X] T056 [P] Update Student Feature install/check/run and focused test commands in `specs/002-student-feature/quickstart.md`; distinguish automated tests from browser/manual acceptance.
- [X] T057 [P] Create the FR/SC → task → implementation → test traceability matrix in `specs/002-student-feature/traceability.md`; include the cross-module gate and identify every manual-only acceptance.
- [X] T058 Compare the implementation with the three Student PlantUML diagrams; update `diagrams/002-student-feature-component.puml`, `diagrams/002-student-feature-class.puml`, and `diagrams/002-student-feature-sequence.puml` where needed, then regenerate and inspect the matching PNG files in `diagrams/` using the Constitution-required PlantUML CLI command.
- [ ] T059 After T004, T041, and T043–T045, review the implemented Teacher/Student internal interfaces and additive Student HTTP/Socket contracts against `docs/integration/student-teacher-decisions.md`, `docs/integration/teacher-foundation-integration-guide.md`, and `specs/002-student-feature/contracts/`; record actual review status and any contract differences without changing Foundation public contracts implicitly.
- [ ] T060 After T066 and reviewed Teacher integration, run `npm.cmd run check` from the repository root and record TypeScript, Build, Vitest, and any failures in `specs/002-student-feature/quickstart.md`; include Foundation regression results and do not mark manual acceptance complete from automated results.
- [ ] T061 After T004, T041, T043–T045, T050–T055, T059, and T066, perform the Windows browser acceptance using `tests/manual/student-feature.md` with at least two student clients and an authenticated Teacher workflow. Time three fresh joins from submitting a valid Activity Code to rendering enrolled membership (120 seconds per run). Verify multi-tab disconnect, last-socket handoff, no eligible successor and F5 recovery of the same Participant with the current role. Record actual results and unrun checks.

## Follow-up: Student leader failover (2026-11-14)

The following tasks cover Student automatic succession. Coordinate FR-004 with OpenSpec/Teacher for common acceptance.

- [X] T062 [US1] Add failing backend cases in `tests/integration/student-leader-reconnect.test.ts`, `tests/persistence/student-migration.test.ts` and `tests/integration/student-submission-transaction.test.ts`: ordered eligibility, cross-Team/Session and invalid credentials, multiple sockets, no candidate, repeated disconnect, F5 identity vs role, commit-only invalidation and both failover/submit transaction orders.
- [X] T063 [US1] After T062, add the Student join-order migration in `apps/server/src/persistence/migrations/` using the next available number; integrate order assignment with `enrollment-service.ts` and `team-change-service.ts`, including existing-data backfill, repeat joins, move ordering and rollback.
- [X] T064 [US1] After T063, implement trusted socket presence and atomic last-disconnect failover in `apps/server/src/modules/student/realtime/` and `apps/server/src/modules/student/application/`; register the Student invalidation event in `packages/contracts/src/student-realtime.ts`, with no public Foundation event changes. Verify duplicate/stale disconnect, all phases, and scoped post-commit delivery.
- [X] T065 [US2] After T064, add failing browser-component cases to `tests/web/student-activity-draft.test.tsx` and `tests/web/student-join-pages.test.tsx`; wire `/me` invalidation and reconnect in `apps/web/src/modules/student/student-session-state.ts` and `apps/web/src/pages/StudentSessionPlaceholder.tsx`. Verify stale membership responses, F5 recovery, role-gated submission and unchanged draft content.
- [X] T066 [US1] After T065, execute the independent multi-socket/browser scenarios in `tests/manual/student-feature.md`, review design against the three Student diagrams, and record real outcomes and regression evidence in `specs/002-student-feature/quickstart.md`. Teacher-specific acceptance remains T061.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 (T001–T004)**: Read-only Foundation verification and cross-module review record. T004 is a hard gate only for the End/winner integration tasks; unrelated Student infrastructure may proceed.
- **Phase 2 (T005–T016)**: Depends on the existing Foundation workspaces. Completes the shared Student persistence, identity, security and module seams before user flows.
- **US1 (T017–T024)**: Depends on Phase 2.
- **US2 Draft (T027–T032)**: Depends on the trusted identity/Team context and draft migration in Phase 2; functional collaboration also depends on a joined Participant from US1.
- **US2 Submission (T033–T038)**: Depends on US1 membership/leader and US2 draft work. Submission and draft lock are one transaction.
- **US3 (T039–T046)**: State display can begin after Phase 2; result projection depends on Foundation records and submission behavior. T004 and T044 are complete. T045 production composition exists; T067/T068 verify real Teacher security and End races. Original T041/T045 remain open for explicit owner closeout; their dependencies are retained, not bypassed by this documentation review.
- **UI (T047–T054)**: UI tests precede implementation; each page depends on its corresponding server/API or adapter task. Tasks for different pages/components can run in parallel only when file paths do not overlap.
- **Polish (T055–T061)**: Documentation/traceability tasks can proceed after contracts stabilize; final checks and manual acceptance depend on all selected Student stories and the reviewed Teacher integration.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 identity and persistence. Its core join/recovery story can be independently tested.
- **US2 (P1)**: Depends on verified Participant/Team context from US1. Draft editing and Submission are separate checkpoints, with Submission depending on the draft service and lock state.
- **US3 (P1)**: Reuses Foundation state sync. End/winner integration depends on the T004 review and successful US2 Submission path; the Student result projection can be tested against controlled persisted fixtures.

### Parallel Opportunities

- T001 and T002 both write `student-feature-review-gate.md` and therefore run sequentially (T002 follows T001); T003 depends on their Foundation capability/source inventory; T004 depends on the proposal in T003.
- In Phase 2, migration tests (T005), DTO work (T009–T010), and independent middleware tests (T011/T013) can be developed in parallel where file paths differ. Migration implementation (T006) precedes repositories (T007–T008).
- US1 tests T017–T020 can be authored in parallel; service and controller work follows the corresponding tests.
- US2 draft contract/persistence tests T027–T028 can run in parallel. HTTP, realtime and web adapter tasks must use the shared DraftService contract.
- US2 submission tests T033–T034 can run in parallel; implementation proceeds validator → transaction service → API/notification.
- US3 state tests T039 and result tests T040 can run in parallel. T004 passed design review on 2026-11-20; proceed with T041 tests first, T044, T045, then validate T041 against the real path.
- UI pages with distinct file paths may be split across contributors after their APIs stabilize; do not have multiple contributors edit the same shared Student router, `app.ts`, or contracts index concurrently.

## Independent Acceptance Criteria

- **US1**: From a clean test database, valid code exposes only existing Team choices; a valid join creates/restores a Participant; concurrent first joins produce no more than one leader; wrong Session/Team/identity is rejected; a fresh credential can late-join an existing Team after first Active; an existing Participant cannot transfer after first Active.
- **US2 Draft**: Two authorized clients on the same Team/Round converge on committed values and versions; last server-accepted same-Blank write wins; persisted snapshots restore after refresh/reconnect; invalid CSRF/phase/Blank, locked drafts, and different Team/Session subscriptions are rejected/isolated.
- **US2 Submission**: Only the server-verified leader can submit during Active; all answerable Blanks are present and non-whitespace; one Team/Round produces at most one Submission; acceptedOrder is server-generated; Submission, answers and draft lock commit or rollback together.
- **US3**: Student state follows authoritative Foundation snapshots and reconnect; result is unavailable before Ended; End selects the earliest accepted valid Submission inside the same transaction; no Submission yields no Result; only the winner projection is returned; commit broadcasts, rollback does not.

## Implementation Strategy

1. Complete Phase 1 review record and gate, then Phase 2 shared Student seams.
2. Deliver US1 join/recovery and independently validate it.
3. Deliver US2 draft collaboration, then US2 submission as a separate tested increment.
4. Complete the reviewed US3 End/winner transaction and result projection.
5. Integrate the existing Student routes/UI and run Polish acceptance.
6. Do not start blocked Teacher-facing service wiring until T004 is recorded as approved; do not represent proposed permissions as active Foundation grants.

## Notes

- `[P]` means separate files and no incomplete-task dependency; `[US1]`, `[US2]`, `[US3]` map directly to `spec.md`.
- All test tasks should be written first and observed failing for the intended reason before implementation.
- Keep all work in the existing React/Vite app, Express/Socket.IO server, SQLite database, and `@quiz/contracts` package.
- No Teacher UI, Student Excel parsing, public test bypass, duplicate Foundation model, or Foundation public API/DTO/Socket event change is included.
- PlantUML and matching PNG updates are required whenever the design or implementation responsibility/data flow changes.

## Phase 9: Convergence

**Assessment date**: 2026-11-23. Intent: this feature's Spec, Plan and existing Tasks, governed by the current Constitution. Read-only code/test inspection found five partial obligations; no application changes or test execution occurred during this assessment. Teacher code now exists locally, including `apps/server/src/main.ts`, `modules/teacher/integration.ts`, the real Teacher router and signed-Cookie/Origin/CSRF adapters. Do not recreate these services or treat the earlier controlled-adapter tests as final integration acceptance.

**Accounting**: T067–T071 below are actionable closeout tasks for the existing open T045, T041, T061, T059 and T060 respectively, not five additional product requirements. Original IDs, checkboxes and Cancelled T025/T026 remain unchanged. At Phase 9 creation there were 71 retained task IDs, 2 Cancelled, 69 active checklist entries, 59 checked and 10 unchecked. Current T070 accounting is 62 checked / 69 active, with 7 unchecked entries: T041, T045, T059, T060, T061, T069 and T071. Original and convergence entries overlap; their checkbox counts are not distinct product requirements. Close an original task only when its actual acceptance conditions are met.

- [X] T067 [US3] **HIGH / F1** Complete the remaining T045 security acceptance using `createTeacherIntegration` and the real Teacher login/router/Socket identity in `tests/realtime/teacher-socket.test.ts`, `tests/realtime/student-socket-auth.test.ts` and, where needed, `tests/integration/student-end-composition.test.ts`. Reuse `tests/helpers/teacher.ts`; obtain a real signed Teacher Cookie and a real Student Cookie, establish a valid Student-scoped socket, then revoke/expire the Student identity and prove a subsequent watch is rejected without Teacher fallback or joining the requested unauthorized room. Cover valid mixed-Cookie Student scope, Teacher-only scope, invalid Origin and forged role/permission claims; reuse existing passing-case coverage rather than duplicating it. Verify the actual `main.ts` -> `startServer(createTeacherIntegration(...))` composition and record any remaining unverified startup boundary. No new Teacher auth scheme or test endpoint. Record evidence before closing T045 per T045, SC-002 and plan: Cookie/Socket trust boundary (partial).

  **2026-11-23 T067 verification:** Real `createTeacherIntegration` and Router issue signed Teacher Cookies through login and canonical Student Cookies through enrollment. Call-through spies on the actual composed Teacher Socket resolver/authorizer prove revoked/expired Student connections never invoke either adapter, with or without a valid Teacher Cookie; a Teacher-only positive control proves those observed adapters remain installed and functional. Tests also cover valid mixed-Cookie Student draft access, foreign Session rejection, forged role claims, real Cookie signature tampering, expiry, Origin and trusted watch guards. A subprocess runs the actual `main.ts` against isolated SQLite and verifies Teacher login, CSRF/Origin enforcement and Socket watch without a mocked adapter. Targeted tests: 3 files / 33 passed. Full `NODE_ENV=test; npm.cmd run check`: TypeScript, 77 files / 436 tests and Production Build passed; existing Vite >500 kB warning remains. `git diff --check` passed. Only tests and T067 evidence changed; no production logic or public contract change, so no design/diagram change was needed. See Quickstart for limits. T041, T045 and T068–T071 remain unchecked; this is automated security evidence, not browser or full End-race acceptance. Active checklist tracking is now 60 checked / 69 active, with 9 open entries (original and convergence closeout entries overlap as explained above).

- [X] T068 [US3] **HIGH / F2** After T067, close the remaining T041 formal-path test gap in `tests/integration/student-end-race.test.ts`, `tests/integration/student-end-composition.test.ts` and `tests/integration/teacher-end.test.ts`. Reuse the actual composition-root Coordinator, Foundation Port, Student Submission service and the same Database instance; do not introduce a mock End transaction. Extend the existing real Teacher HTTP tests beyond sequential calls with deterministic two-connection write-lock ordering for Submit-first and End-first. Verify committed winner selection by acceptedOrder, late Submit rejection, no winner/prior logical-target Result removal, injected resolver or persistence rollback, no publication on rollback, externally visible committed Result before publication, and successful End despite publisher failure. Reuse existing T044 tests for already-proven Port internals; add only missing composed-path assertions. Use controlled barriers or a worker if blocking operations require one, with no timing-only race claims. Record formal-path evidence before closing T041 per T041, FR-017, FR-023 and US3/AC3 (partial).

  **2026-11-23 T068 verification:** Added nine composed-path cases in `tests/integration/teacher-end.test.ts` and the test-only `tests/helpers/teacher-end-race-worker.ts`. Both writers use actual HTTP routes and real Teacher/Student authentication. Each composition shares its Database among lifecycle/Coordinator/resolver/submission; the second connection targets the same isolated SQLite file solely to test writer serialization. Temporary SQLite hooks plus a SharedArrayBuffer/Atomics barrier establish the first writer's lock before the competing request, without sleeps. Call-through observation confirms SQLITE_BUSY at the Foundation End entry for Submit-first; for End-first the real Student HTTP credential last-seen write encounters the lock first, and a post-Commit retry reaches SubmissionService and rejects Ended. Existing T044 tests separately cover direct submission-transaction contention. Additional cases cover actual acceptedOrder selection, same-transaction resolver execution, second-connection committed Result visibility before real publication, both duplicate-End 409 variants, resolver/Result-write rollback with retained previous winner and no publication, safe retry, no-winner cleanup for Question/QuestionGroup with other Session/target isolation, fresh Round drafts and publication failure returning committed success. Targeted: 3 files / 47 tests passed. Full `NODE_ENV=test; npm.cmd run check`: TypeScript, 77 files / 445 tests and Production Build passed; existing Vite >500 kB warning remains. `git diff --check` passed. No production logic, schema, dependency or public contract changed. T041/T045 and T069–T071 remain unchecked; no manual acceptance or broader task closeout is inferred. Active checklist tracking is now 61 checked / 69 active, with 8 open entries including overlapping original/closeout tasks.

- [ ] T069 [US1] **HIGH / F3** After T070 and T071 plus the original T061 dependencies, complete and record real Windows acceptance in `tests/manual/student-feature.md` with the authenticated Teacher workflow and at least two Student Teams. Measure three fresh joins individually against 120 seconds; record Teacher-driven Waiting/Active/Ended, next/reopened Round, both Student displays within 2 seconds, authoritative reconnect, winning/no-winner results, target/draft reset and lock behavior. Include the still-pending single-Question Demo and pre-start team-change/role-handoff browser checks, preserving Cookie identity and multi-socket failover. Record actual browser/environment/timings, failures and unrun checks; retain the Vite ECONNABORTED observation unless reproduced and resolved. Never infer a browser pass from component tests or rewrite prior observations. Close T061 only with its required evidence per T061, SC-001, SC-005, FR-005 and US3/AC2-5 (partial).

  **2026-11-23 T069 partial browser verification (NOT COMPLETE):** On Windows with a new isolated SQLite and the unchanged formal npm dev composition, the existing password CLI and real Teacher login passed; Teacher UI created DDR6VR. Two independent host Cookies enrolled Students A/B, showing Waiting/current Team/leader and live connection. Sole leader A moved to an empty Team without a successor input; B then joined the emptied source and became leader. Valid-code submission to observed membership upper bounds were 11.702 s and 8.912 s, including tool intervals; no third timing exists. Computer Use stopped while preparing the third native Chrome identity because it could not confidently determine the URL; no bypass was attempted. Google Sheets import for the newly created activity was separately blocked by intentionally unconfigured test service-account access. The official dev Seed activity was prepared but not played. Active/draft/submit/End/results/next/reopen/single/group/F5/disconnect/failover and two-client <=2 s timing were NOT TESTED this round. See tests/manual/student-feature.md for PASS/BLOCKED/NOT TESTED details and password instructions. No product/test logic, existing .env/password/database configuration or task checkbox changed. The test dev process stopped and temporary credential file was removed. T069 and T061 remain unchecked; original owner-closeout dependencies remain unchanged.
- [X] T070 **MEDIUM / F4** After T067 and T068, complete T059's actual contract review using the current `main.ts`, `modules/teacher/integration.ts`, Teacher router, scoped actor factory, Socket identity, Coordinator and Foundation Port. Update `docs/integration/student-feature-review-gate.md`, `docs/integration/student-teacher-decisions.md`, `docs/integration/teacher-foundation-integration-guide.md`, `specs/002-student-feature/contracts/internal-services.md` and `traceability.md` only where current-status statements are obsolete; preserve dated historical evidence and accepted responsibilities. Distinguish existing production adapters from executed security verification and owner review; do not claim OpenSpec or other reviewers have approved without evidence. Recheck the three Student diagrams against actual composition, update affected `.puml` before related implementation changes, and regenerate/inspect matching PNGs using PlantUML CLI if updates are needed. Preserve public Foundation contracts and Cancelled Teacher leader transfer. Record concrete signature/behavior differences or an explicit no-difference result per T059, T058 and plan: cross-module contracts/composition (partial).

  **2026-11-23 T070 verification:** Reviewed Constitution, Student Spec/Plan/Research/Data Model/Contracts/Quickstart/Traceability, three integration handoffs, current Teacher contracts, real composition/auth/End code and T067/T068 evidence. Corrected obsolete adapter/Port status, actual Coordinator parameter type and implementation path, Cookie/error details and phase descriptions; found no incompatible public Foundation contract or new production defect. Updated all three Student PlantUML sources, generated matching PNGs with PlantUML CLI (exit 0), and inspected each image. Twelve changed Markdown files pass code-fence/local-link checks; task IDs remain T001–T071, with Cancelled T025/T026 excluded. SHA-256 comparison of all 257 files in apps/packages/tests confirms no change from this round's starting state, including pre-existing test edits. git diff --check passes. No new test execution or browser acceptance is claimed; latest full evidence remains T068's 77 files / 445 tests. T041/T045 technical requirements are evidenced by T067/T068 but their original checkboxes remain open for explicit owner closeout; T059–T061/T069/T071 are not marked complete. No new OpenSpec/owner approval is inferred. Current accounting: 62 checked / 69 active, 7 open overlapping entries.
- [X] T071 **MEDIUM / F5** After T067, T068 and T070, perform T060's full integrated regression with `NODE_ENV=test` and `npm.cmd run check`; verify Foundation, Student and current Teacher integration suites including migration/location and data isolation. Fix only evidenced failures within the approved scope or report their owner/dependency; do not rebuild completed functionality. Record actual commands, test-file/test counts, TypeScript/Build outcomes, warnings and unrun checks in `specs/002-student-feature/quickstart.md`, and update requirement-to-test evidence in `traceability.md`. Earlier 231-test evidence predates the current Teacher integration and must remain historical. Close T060 only after the reviewed integrated version passes; this does not complete T061 manual acceptance per T060 and plan: full regression/isolated SQLite validation (partial).

  **2026-11-23 T071 verification:** On feature/student after T067/T068/T070, ran NODE_ENV=test; npm.cmd run check. The sandbox attempt passed typecheck but failed 207 tests (238 passed) with localhost EACCES/related timeouts; a minimal TCP probe confirmed CONNECT EACCES. Re-running the identical check with approved unsandboxed execution passed TypeScript, all 77 files / 445 tests (32.75 s Vitest summary), and Contracts/Server/Web Production Build; exit 0. T067 real Cookie/Socket security and T068 formal HTTP races remain passing, alongside migration/location/foreign-key/isolation, draft/submission/result/next/reopen/reconnect/leader regression suites. Existing Vite >500 kB warning (675.63 kB JS, gzip 195.50 kB) and jsdom environment-startup advisory are recorded, not suppressed. git diff --check passed; all 257 apps/packages/tests files retain their starting hashes. Only Quickstart/Tasks/Traceability records changed in this round. No password, environment file, database setting, product/test logic or public contract change. T041/T045 have sufficient technical evidence for owner closeout; T060 has this regression evidence, but all original checkboxes remain unchanged. T069/T061 browser/timing acceptance was not executed. Current accounting: 63 checked / 69 active, six open overlapping entries (T041/T045/T059/T060/T061/T069); T025/T026 remain Cancelled.
**Execution order**: T067 -> T068 -> T070 -> T071 -> T069. Respect the original task dependencies and existing T004 design approval. This convergence pass does not complete any task, grant Teacher authority, approve cross-group requirements or authorize Git operations.
