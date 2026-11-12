---
description: "Dependency-ordered implementation tasks for Student Feature"
---

# Tasks: Student Feature

**Input**: Design documents from `/specs/002-student-feature/`

**Prerequisites**: `plan.md`, `spec.md`; supporting design in `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `diagrams/002-student-feature-*.puml`.

**Organization**: Tasks are staged by setup/gate, shared prerequisites, and the three P1 user stories. US2 is split into Draft and Submission increments because they have distinct acceptance checkpoints. UI work is grouped after service contracts are available, with every task mapped to its owning story.

**Execution rule**: All tasks start unchecked. Do not implement a task before its listed dependencies and review gates pass. Tests are TDD tasks: write the test first, verify it fails for the expected reason, then implement.

## Format: `- [ ] [TaskID] [P?] [Story?] Description`

- **[P]**: The task can run in parallel without editing the same files or depending on unfinished work.
- **[Story]**: User Story label from `spec.md`; Setup and Foundational tasks have no story label.
- Every task names its output or test file path.

## Phase 1: Setup and Cross-Module Review Gate

**Purpose**: Verify reuse of Foundation and record the architecture decision separately from interface proposals. T004 is a hard gate for all tasks explicitly marked as blocked by review.

- [X] T001 [P] Verify the existing workspace, Node/npm requirements, Vitest/Supertest/Socket.IO Client tools, Express composition root, `ActorContext`, SQLite `DatabaseManager`, Foundation repositories, and Socket.IO server; record actual source paths and reuse boundaries in `docs/integration/student-feature-review-gate.md`.
- [X] T002 Record the implemented Foundation capabilities (`session:read`, `session:watch`, `target:preview`, `target:read`, `results:read`) and label `team:leader:transfer` and `round:end` as proposed additions, not existing grants, in `docs/integration/student-feature-review-gate.md` after T001 creates the review record.
- [X] T003 Document and review the proposed `TransferTeamLeaderInput`/service and error mapping, the single `StudentTrustedEndCoordinator.endRound(...)` call, synchronous `WinnerResolver(roundId): Result | null` callback, shared SQLite instance/transaction ownership, no-winner behavior, and rollback/no-broadcast behavior in `docs/integration/student-feature-review-gate.md`.
- [ ] T004 Obtain Teacher and Foundation owner review of the interfaces and permission names; record which responsibility directions are already decided, which signatures/capabilities were accepted or changed, and reviewer/date in `docs/integration/student-teacher-decisions.md`. **Gate**: tasks marked “blocked until T004 review” MUST NOT start until this record is approved; rejected proposals return to Plan/Clarify before implementation.

**Gate boundary**: The architecture owner has decided the responsibility direction. T004 review verifies actual cross-module signatures, capability names, and same-transaction wiring; it does not re-open the decided Student/Teacher/Foundation responsibility split. No new Foundation public HTTP, DTO, or Socket.IO contract is authorized here.

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
- [X] T019 [P] [US1] Add identity recovery tests for `student_session` cookie attributes (`Path=/`, HttpOnly, SameSite=Lax, Secure on production HTTPS), no bearer value in JSON/logs, refresh recovery, expiry/revocation, and no restore by display name in `tests/api/student-identity.test.ts`; verify a brief disconnect/reconnect retains the same leader eligibility in `tests/integration/student-leader-reconnect.test.ts`.
- [X] T020 [P] [US1] Add team-change tests for pre-Active change, required leader handoff, invalid successor, rollback, and rejection after first Active in `tests/integration/student-team-change.test.ts`.

### Implementation for User Story 1

- [X] T021 [US1] Implement restricted join-options service and `GET /api/v1/student/join-options/{activityCode}` in `apps/server/src/modules/student/application/join-options-service.ts` and `apps/server/src/api/student/join-options-controller.ts`; reuse Foundation `SessionQueryService`, expose only phase and existing Team IDs/names, and apply configurable throttling.
- [X] T022 [US1] Implement atomic enrollment and initial leader election in `apps/server/src/modules/student/application/enrollment-service.ts`; validate that the selected Team belongs to the Session, create/reuse canonical Participant and credential mapping, and insert TeamLeader only if absent. Permit a first-time join after first Active only into an existing Team; never create a Team or move an existing Participant through enrollment.
- [X] T023 [US1] Implement `POST /api/v1/student/sessions/{sessionId}/enrollments`, `GET .../me`, and `GET .../csrf-token` controllers in `apps/server/src/api/student/enrollment-controller.ts` and `apps/server/src/api/student/student-router.ts`; allow the no-token bootstrap only when no Participant binding exists for that credential/Session, strictly require an allowed Origin and full server validation, require CSRF for an already-bound retry, return server-derived membership/leader status, set only the opaque `student_session` cookie with `Path=/`, HttpOnly, SameSite=Lax and Secure on production HTTPS, and preserve existing active-cookie CSRF validity across tabs.
- [X] T024 [US1] Implement the Student-requested pre-start team-change transaction in `apps/server/src/modules/student/application/team-change-service.ts` and `apps/server/src/api/student/team-change-controller.ts`; require explicit source-Team successor handoff from a current leader and reject changes after first Active.
- [ ] T025 [US1] Add authorization tests for the Teacher leader-transfer service, including missing ActorContext, wrong Session, absent proposed capability, successor outside Team/Session, concurrent transfer, and at-most-one leader in `tests/integration/student-teacher-leader-transfer.test.ts`. **Blocked until T004 review** confirms the service signature and capability string.
- [ ] T026 [US1] Implement the trusted Teacher leader-transfer service and transactional repository operation in `apps/server/src/modules/student/application/team-leader-administration-service.ts`; require the reviewed ActorContext permission and verify the successor is a member of the specified Team and Session. **Blocked until T004 review**; do not add Teacher UI or a public test bypass.

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
- [ ] T041 [US3] Add Submit-vs-End transaction race tests for both lock orders, result replacement, no Submission, injected resolver failure, rollback, and post-commit-only broadcast in `tests/integration/student-end-race.test.ts`. **Blocked until T004 review** confirms the same-connection callback contract.

### Implementation for User Story 3

- [X] T042 [US3] Integrate the existing Foundation `SessionStateClient` into the Student activity route in `apps/web/src/modules/student/student-session-state.ts`; display authoritative state and Round reference, ignore stale versions, and resubscribe/reconcile on reconnect without duplicating Foundation Socket.IO events.
- [X] T043 [US3] Implement the synchronous Student winner resolver over canonical accepted Submissions in `apps/server/src/modules/student/application/winner-resolver.ts`; order by persisted `accepted_order`, construct the canonical Foundation Result candidate, and return `null` when no valid Submission exists without writing Result or publishing state.
- [ ] T044 [US3] Add the minimal Foundation internal lifecycle port that accepts a synchronous winner callback using the same `Database` connection and `BEGIN IMMEDIATE` transaction in `apps/server/src/modules/sessions/application/foundation-transactions.ts` and `apps/server/src/modules/sessions/application/session-lifecycle-service.ts`; persist Ended/stateVersion/Result atomically, clear the prior logical-target Result on no winner, and publish only after commit. **Blocked until T004 review**; do not change Foundation public HTTP, DTO, or Socket.IO contracts.
- [ ] T045 [US3] After T043 and T044, implement the single synchronous `StudentTrustedEndCoordinator.endRound(input, actorContext)` in `apps/server/src/modules/student/application/student-trusted-end-coordinator.ts`; validate the reviewed Teacher scope/capability and call the Foundation lifecycle port once with the synchronous Student resolver. **Blocked until T004 review**; Teacher must not call resolver and Foundation End separately.
- [X] T046 [US3] Implement the Student-only Ended result projection and route in `apps/server/src/modules/student/application/student-result-service.ts` and `apps/server/src/api/student/result-controller.ts`; require enrolled Participant context and return only winning Team name/answers or `winner: null`.

---

## Phase 7: Student UI Integration (US1, US2, US3)

**Purpose**: Fill the existing Foundation Student routes and layout after their server contracts are available. Keep UI tasks attached to the corresponding user story; no Teacher UI is included.

- [X] T047 [P] [US1] Add responsive and accessible interaction tests for join, membership, late enrollment, validation errors, and failed identity recovery in `tests/web/student-join-pages.test.tsx`.
- [X] T048 [P] [US2] Add responsive and accessible interaction tests for dynamic Blank/QuestionGroup rendering, collaborative draft state, leader-only submit controls, validation errors, and locked state in `tests/web/student-activity-draft.test.tsx`.
- [X] T049 [P] [US3] Add responsive and accessible interaction tests for Waiting/Ended restrictions, reconnect state, winner/no-winner projection, and result privacy in `tests/web/student-result-state.test.tsx`.
- [X] T050 [US1] Replace the existing `/student/join` placeholder with Activity Code lookup, restricted join options, validation errors, and existing-Team selection in `apps/web/src/pages/StudentJoinPlaceholder.tsx`.
- [X] T051 [US1] Implement Student enrollment/recovery client and membership view (Team, display name, leader status) in `apps/web/src/modules/student/student-identity-client.ts` and `apps/web/src/modules/student/StudentMembershipPanel.tsx`; never expose or persist the opaque cookie in JavaScript storage.
- [X] T052 [US2] Implement a data-driven target editor for one Question with multiple Blanks and a QuestionGroup with multiple Questions in `apps/web/src/modules/student/StudentTargetEditor.tsx`; render controls from received Blank data and never parse Excel or hard-code counts.
- [X] T053 [US2] Implement shared draft view, leader-only submit control, pending/success/failure feedback, and read-only locked state in `apps/web/src/modules/student/StudentDraftPanel.tsx` and `apps/web/src/modules/student/StudentSubmissionControls.tsx`.
- [X] T054 [US3] Replace the existing `/student/session/:sessionId` placeholder with Waiting/Active/Ended panels, Round changes, and connection recovery messaging in `apps/web/src/pages/StudentSessionPlaceholder.tsx`; render the Student result panel only after Ended.

---

## Phase 8: Polish and Integrated Acceptance

**Purpose**: Complete traceability and operational evidence without claiming manual tests that have not been run.

- [X] T055 [P] Update the Windows Student Feature validation steps and expected limitations in `tests/manual/student-feature.md`; include cookie/CSRF inspection, two-member shared draft, late join, leader transfer, submission, End race, reconnect, isolation, and authenticated Teacher workflow.
- [X] T056 [P] Update Student Feature install/check/run and focused test commands in `specs/002-student-feature/quickstart.md`; distinguish automated tests from browser/manual acceptance.
- [X] T057 [P] Create the FR/SC → task → implementation → test traceability matrix in `specs/002-student-feature/traceability.md`; include the cross-module gate and identify every manual-only acceptance.
- [X] T058 Compare the implementation with the three Student PlantUML diagrams; update `diagrams/002-student-feature-component.puml`, `diagrams/002-student-feature-class.puml`, and `diagrams/002-student-feature-sequence.puml` where needed, then regenerate and inspect the matching PNG files in `diagrams/` using the Constitution-required PlantUML CLI command.
- [ ] T059 After T004, T026, and T043–T045, review the implemented Teacher/Student internal interfaces and additive Student HTTP/Socket contracts against `docs/integration/student-teacher-decisions.md`, `docs/integration/teacher-foundation-integration-guide.md`, and `specs/002-student-feature/contracts/`; record actual review status and any contract differences without changing Foundation public contracts implicitly.
- [ ] T060 Run `npm.cmd run check` from the repository root and record TypeScript, Build, Vitest, and any failures in `specs/002-student-feature/quickstart.md`; include Foundation regression results and do not mark manual acceptance complete from automated results.
- [ ] T061 After T004, T026, T041, T043–T045, T050–T055, and T059, perform the Windows browser acceptance using the completed `tests/manual/student-feature.md` with at least two student clients and an authenticated Teacher workflow. Time three fresh join runs from submitting a valid Activity Code to the enrolled Session page rendering and record each elapsed duration; the SC-001 threshold is 120 seconds per run. Briefly disconnect/reconnect the initial leader and verify the same Participant retains submission eligibility. Record actual results, environment, and any unrun checks; do not claim the two-minute threshold passed without measured evidence.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 (T001–T004)**: Read-only Foundation verification and cross-module review record. T004 is a hard gate only for the leader-transfer and End/winner integration tasks; unrelated Student infrastructure may proceed.
- **Phase 2 (T005–T016)**: Depends on the existing Foundation workspaces. Completes the shared Student persistence, identity, security and module seams before user flows.
- **US1 (T017–T026)**: Depends on Phase 2. T025–T026 are additionally blocked until T004 passes.
- **US2 Draft (T027–T032)**: Depends on the trusted identity/Team context and draft migration in Phase 2; functional collaboration also depends on a joined Participant from US1.
- **US2 Submission (T033–T038)**: Depends on US1 membership/leader and US2 draft work. Submission and draft lock are one transaction.
- **US3 (T039–T046)**: State display can begin after Phase 2; result projection depends on Foundation records and submission behavior. T041, T044 and T045 are blocked until T004 passes.
- **UI (T047–T054)**: UI tests precede implementation; each page depends on its corresponding server/API or adapter task. Tasks for different pages/components can run in parallel only when file paths do not overlap.
- **Polish (T055–T061)**: Documentation/traceability tasks can proceed after contracts stabilize; final checks and manual acceptance depend on all selected Student stories and the reviewed Teacher integration.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 identity and persistence. Its core join/recovery story can be independently tested; Teacher leader recovery (T025–T026) is specifically gated by T004.
- **US2 (P1)**: Depends on verified Participant/Team context from US1. Draft editing and Submission are separate checkpoints, with Submission depending on the draft service and lock state.
- **US3 (P1)**: Reuses Foundation state sync. End/winner integration depends on the T004 review and successful US2 Submission path; the Student result projection can be tested against controlled persisted fixtures.

### Parallel Opportunities

- T001 and T002 both write `student-feature-review-gate.md` and therefore run sequentially (T002 follows T001); T003 depends on their Foundation capability/source inventory; T004 depends on the proposal in T003.
- In Phase 2, migration tests (T005), DTO work (T009–T010), and independent middleware tests (T011/T013) can be developed in parallel where file paths differ. Migration implementation (T006) precedes repositories (T007–T008).
- US1 tests T017–T020 can be authored in parallel; service and controller work follows the corresponding tests.
- US2 draft contract/persistence tests T027–T028 can run in parallel. HTTP, realtime and web adapter tasks must use the shared DraftService contract.
- US2 submission tests T033–T034 can run in parallel; implementation proceeds validator → transaction service → API/notification.
- US3 state tests T039 and result tests T040 can run in parallel. End transaction tasks T041/T044/T045 remain gated by T004.
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
