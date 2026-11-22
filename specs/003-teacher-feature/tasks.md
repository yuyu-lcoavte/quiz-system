---
description: "Dependency-ordered implementation tasks for Teacher Feature"
---

# Tasks: Teacher Feature

**Input**: Design documents from `/specs/003-teacher-feature/`

**Prerequisites**: `plan.md`, `spec.md`; supporting design in `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `diagrams/003-teacher-feature-*.puml`.

**Tests**: Required by Constitution V and the plan. Tests are written first in each phase; confirm they fail for the expected reason, then implement.

**Organization**: Phases follow priority P1 → P2 → P3 → P4. US1 and US2 (both P1) come first, then US3 (P2 import), US4 (P3 write-back), US5 (P4 CSV). Every phase ends with a task that runs `npm.cmd run check`; the next phase starts only after it passes.

**Coordination rule**: Tasks marked **【需與學生端負責人協調】** change a shared file listed in the plan's Coordination table (or a shared test that the change breaks). Agree the exact diff with the Student owner before merging; each is its own task.

## Format: `- [ ] [TaskID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks).
- **[Story]**: US1–US5 from `spec.md`; Setup, Foundational and Polish tasks have no story label.

---

## Phase 1: Setup (shared contracts and configuration files)

**Purpose**: Teacher DTO contracts and environment template. No server behaviour yet.

- [X] T001 [P] Write contract validator tests in `tests/unit/teacher-contracts.test.ts`: `teamCount` must be an integer "1–20"; `expectedStateVersion` a non-negative safe integer; `url` a non-empty string of at most 2048 characters; `previewDigest`/`planDigest` 64 lowercase hex characters; unknown fields ignored.
- [X] T002 [P] Create `packages/contracts/src/teacher.ts` with the Teacher DTOs and error-code union from `specs/003-teacher-feature/contracts/teacher-http-api.md` (`TeacherMeView`, `ActivitySummary`, `TeacherSessionView`, `TargetStatusView` with status `'NotOpened'|'Waiting'|'Active'|'Ended'`, monitor, results, import preview, write-back plan) and the request-body parsers tested in T001.
- [X] T003 【需與學生端負責人協調】 Add `export * from './teacher.js';` to `packages/contracts/src/index.ts` (shared package entry; additive one line).
- [X] T004 [P] 【需與學生端負責人協調】 Create root `.env.example` with placeholder (non-secret) values for every project variable: existing `PORT`, `SQLITE_PATH`, `STUDENT_ALLOWED_ORIGINS`, `STUDENT_CSRF_SECRET`, activity-code limits, and new `TEACHER_PASSWORD_HASH`, `TEACHER_SESSION_SECRET`, `TEACHER_ALLOWED_ORIGINS`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (comment: path must be outside the repository). Confirm `.gitignore` still ignores `.env` and `.env.*` but not `.env.example`.
- [X] T005 Run `npm.cmd run check` and record the result under a new "Validation log" heading in `specs/003-teacher-feature/quickstart.md`.

**Checkpoint**: contracts build; check passes.

---

## Phase 2: Foundational (blocking prerequisites for every story)

**Purpose**: migration 006, Teacher config, repositories, router composition and server entry. No Teacher routes yet besides the skeleton.

- [X] T006 Write `tests/integration/teacher-migration.test.ts`: after `runMigrations`, tables `teacher_login_sessions`, `teacher_sheet_sources`, `teacher_blank_cells` exist; `teacher_blank_cells.blank_id` references `blanks(id)`; `teacher_sheet_sources.session_id` references `sessions(id)`; unique `(session_id, cell_a1, marker_index)` enforced; migrations 001–005 unchanged.
- [X] T007 Create `apps/server/src/persistence/migrations/006-teacher-feature.sql` per `data-model.md`: `teacher_login_sessions(id_digest TEXT PK, issued_at, expires_at, revoked_at NULL)`; `teacher_sheet_sources(session_id TEXT PK FK sessions, spreadsheet_id, sheet_id INTEGER, sheet_title, imported_at)`; `teacher_blank_cells(blank_id TEXT PK FK blanks, session_id FK teacher_sheet_sources, cell_a1, original_content, marker NULL, marker_index INTEGER, last_written_content NULL, last_written_at NULL, UNIQUE(session_id, cell_a1, marker_index))`. Do not edit 001–005.
- [X] T008 【需與學生端負責人協調】 Update the expected migration list in `tests/integration/migration-location.test.ts` to include `006-teacher-feature.sql` (the shared test hard-codes 001–005 and fails once 006 exists).
- [X] T009 [P] Write `tests/unit/teacher-config.test.ts`: parses `TEACHER_PASSWORD_HASH`, `TEACHER_SESSION_SECRET` (at least 32 bytes), `TEACHER_ALLOWED_ORIGINS` (exact HTTP(S) origins; dev default `http://127.0.0.1:5173,http://localhost:5173`; required in production), `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (optional; a path inside the repository root is rejected); production without hash or secret throws; development without them yields "not configured".
- [X] T010 Implement `apps/server/src/modules/teacher/config.ts` to pass T009 (do not modify `apps/server/src/config/env.ts`).
- [X] T011 [P] Implement Teacher repositories in `apps/server/src/modules/teacher/persistence/login-session-repository.ts`, `sheet-source-repository.ts`, `blank-cell-repository.ts`, and `index.ts`, over the 006 tables using the shared `Database` instance.
- [X] T012 Implement `apps/server/src/modules/teacher/integration.ts` (`createTeacherIntegration(config, overrides?)` returning `TeacherIntegrationOptions`) and `apps/server/src/api/teacher/teacher-router.ts` (`createTeacherRouter(services)` skeleton: JSON errors through the shared `HttpError`/error handler, no business routes yet). Do not set the global `resolveActorContext`.
- [X] T013 Create `apps/server/src/main.ts`: load Teacher config, call `startServer(createTeacherIntegration(config))`. Leave `apps/server/src/app.ts` unchanged.
- [X] T014 【需與學生端負責人協調】 Update `apps/server/package.json`: `dev` → `tsx watch src/main.ts`; add scripts `teacher:hash-password` (`tsx src/modules/teacher/scripts/hash-password.ts`) and `teacher:seed-demo` (`tsx src/modules/teacher/scripts/seed-demo.ts`); add dependency `googleapis`; run `npm.cmd install` so the shared `package-lock.json` is updated in the same change.
- [X] T015 【需與學生端負責人協調】 Update root `package.json`: add `teacher:hash-password` and `teacher:seed-demo`, each forwarding to the `@quiz/server` workspace script.
- [X] T016 Create `tests/helpers/teacher.ts`: temporary SQLite + migrations, `createHttpServer` with `createTeacherIntegration` using a fixed test password hash and secret, a controllable clock, a `login()` helper returning cookie and CSRF token, and an injectable Sheets gateway slot (filled in US3).
- [X] T017 Run `npm.cmd run check`; record in the quickstart Validation log. Also start `npm.cmd run dev` once and confirm the server boots through `src/main.ts`.

**Checkpoint**: Teacher router is mounted at `/api/v1/teacher` (returns 404 for unknown routes); all existing Foundation and Student suites still pass.

---

## Phase 3: User Story 1 — 老師登入與活動控制 (Priority: P1) 🎯 MVP

**Goal**: Teacher logs in, creates an activity with Teams, selects/next/starts/ends/reopens rounds; students see changes within 2 s.

**Independent Test**: `npm.cmd run teacher:seed-demo`, log in, open the seeded activity, run next → start → end and reopen with two Student browsers; every unauthenticated or forged request is rejected.

### Tests for User Story 1

- [X] T018 [P] [US1] Write `tests/unit/teacher-password.test.ts`: hash format `scrypt$N$r$p$<saltB64>$<hashB64>` with N=32768, r=8, p=1, 16-byte salt, 64-byte key; correct password verifies; wrong password and malformed hash return false without throwing.
- [X] T019 [P] [US1] Write `tests/unit/teacher-csrf.test.ts`: token bound to the login session id; wrong session, tampered, expired (8 h) and oversized tokens rejected.
- [X] T020 [P] [US1] Write `tests/unit/teacher-login-rate-limit.test.ts`: 5 failures per 15 minutes per address then 429; 50 failures per 15 minutes overall; success clears that address; window resets with the clock.
- [X] T021 [P] [US1] Write `tests/api/teacher-auth.test.ts`: login sets `teacher_session` (HttpOnly, SameSite=Strict, Path=/, Max-Age=28800, Secure only in production); wrong password 401 `INVALID_CREDENTIALS`; login without allowed Origin 403; `GET /me` returns `csrfToken`, `Cache-Control: no-store`; logout revokes only that device; expired (after 8 h) and tampered cookies 401; every mutation without CSRF or with wrong Origin 403; Teacher cookie alone on shared `GET /api/v1/sessions/:id/current-target` returns 401; not configured → 503 `TEACHER_NOT_CONFIGURED`.
- [ ] T022 [P] [US1] Write `tests/api/teacher-activity.test.ts`: create with `teamCount` 1–20 (0, 21, 2.5 rejected); code is 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` and unique; Teams named `第1組`…`第N組`; Student join-options lists exactly those Teams; list and detail shapes match `teacher-http-api.md`.
- [ ] T023 [P] [US1] Write `tests/api/teacher-rounds.test.ts`: target statuses `NotOpened/Waiting/Active/Ended`; next picks the first NotOpened by position and returns 409 `NO_NEXT_TARGET` when none remain and `NO_QUESTIONS` before import; select while Waiting/Active → 409 `INVALID_PHASE`; stale version → 409 `STALE_STATE`; zero-blank target → 422 `TARGET_NOT_ANSWERABLE`; start/end in wrong phase → 409 `INVALID_PHASE`; reopening an Ended target creates a new Round in Waiting.
- [ ] T024 [P] [US1] Write `tests/integration/teacher-end.test.ts` against the real `endCoordinator`: winner = earliest accepted Submission; client-sent winner/order fields ignored; Submit-vs-End in both lock orders gives a consistent Result; reopen with a new winner replaces the old Result; reopen with no Submission clears the old Result; Ended snapshot published only after commit.
- [ ] T025 [P] [US1] Write `tests/realtime/teacher-socket.test.ts`: valid cookie + allowed Origin → `session:watch` succeeds and receives changes within 2 s; missing/invalid cookie, disallowed Origin, logged-out session → `session:error`, no room join; socket with `auth.sessionId` and a failing Student credential while the browser also has a valid Teacher cookie → not Teacher; an ActorContext not created by the Teacher resolver → `authorizeWatch` false; unknown Session → false.
- [ ] T026 [P] [US1] Write `tests/unit/teacher-seed-demo.test.ts`: seeding creates one Session, 2 Teams `第1組`/`第2組`, 4 targets in order (1 and 2 are QuestionGroups with 2 Questions of 1 Blank each, labelled `（1）`/`（2）`; 3 and 4 single Questions with 1 Blank), no `teacher_sheet_sources` row; seeding refuses when `NODE_ENV=production`. Also assert that no file under `apps/server/src/modules/teacher/` outside `dev/` and `scripts/seed-demo.ts` imports from `modules/teacher/dev/` (source scan).
- [ ] T027 [P] [US1] Write `tests/web/teacher-pages.test.tsx`: login page shows errors and redirects on success; dashboard lists and creates activities; session page shows target list with statuses, next/start/end buttons enabled only in the right phase, and refetches state on a 409; a 401 from any Teacher API call (expired or logged-out session) redirects to `/teacher/login`.

### Implementation for User Story 1

- [X] T028 [P] [US1] Implement `apps/server/src/modules/teacher/auth/password-hash.ts` (Node `crypto.scrypt`, `timingSafeEqual`) to pass T018.
- [X] T029 [P] [US1] Implement `apps/server/src/modules/teacher/scripts/hash-password.ts`: hidden prompt on stdin (no echo, never from argv), prints only the hash.
- [X] T030 [P] [US1] Implement `apps/server/src/modules/teacher/auth/teacher-csrf.ts` to pass T019 (HMAC key derived from `TEACHER_SESSION_SECRET` with a CSRF purpose label).
- [X] T031 [P] [US1] Implement `apps/server/src/modules/teacher/auth/login-rate-limiter.ts` to pass T020 (in-memory, injectable clock).
- [X] T032 [US1] Implement `apps/server/src/modules/teacher/auth/login-session-service.ts`: create session row (SHA-256 digest of 32 random bytes, expires +8 h), cookie value `<id>.<HMAC>`, verify (signature + row valid), logout (set `revoked_at`), delete expired rows at login.
- [X] T033 [US1] Implement middleware in `apps/server/src/api/teacher/middleware/`: `teacher-origin.ts` (exact Origin on non-GET), `teacher-auth.ts`, `teacher-csrf.ts` (`X-CSRF-Token` on non-GET except login), `login-rate-limit.ts`, `session-scope.ts` (UUID check, Session exists → per-request ActorContext from `apps/server/src/modules/teacher/auth/teacher-actor-factory.ts` with permissions `session:read, session:watch, target:preview, target:read, results:read, round:end`).
- [X] T034 [US1] Implement `apps/server/src/api/teacher/auth-controller.ts` (`POST /auth/login`, `POST /auth/logout`, `GET /me`) and register it in `teacher-router.ts` in the order: origin → login → auth → CSRF → session scope. T021 passes.
- [ ] T035 [US1] Implement `apps/server/src/modules/teacher/activity/activity-service.ts` (code generation with `crypto.randomInt`, retry on collision up to 10; Session + Teams in one immediate transaction) and `apps/server/src/api/teacher/activity-controller.ts` (`GET /sessions`, `POST /sessions`, `GET /sessions/:sessionId`). T022 passes.
- [ ] T036 [US1] Implement `apps/server/src/modules/teacher/rounds/target-catalog.ts`: targets = standalone Questions + QuestionGroups sorted by position; status from latest Round; blank counts; `next()`.
- [ ] T037 [US1] Implement `apps/server/src/modules/teacher/rounds/round-control-service.ts` and `apps/server/src/api/teacher/round-controller.ts` (`rounds/select`, `rounds/next`, `rounds/start`, `rounds/end`): blanks ≥ 1 check, then `sessionLifecycle.selectTarget/startRound`; end = one call to `endCoordinator.endRound({ sessionId, roundId, expectedStateVersion, requestId: randomUUID() }, teacherActor)`. T023 and T024 pass.
- [ ] T038 [US1] Implement `apps/server/src/modules/teacher/auth/teacher-socket-identity.ts` (`resolveSocketActorContext`, `authorizeWatch`, WeakSet) and wire it into `integration.ts`. T025 passes.
- [ ] T039 [P] [US1] Create the development-only demo data file `apps/server/src/modules/teacher/dev/demo-guided-notes.dev.ts`, with a header comment "DEVELOPMENT ONLY — not used by the Guided Notes import flow", describing the question-group template structure: numbers 1–4; 1 and 2 groups of two questions with blanks `（1）`, `（2）`; 3 and 4 single questions with one blank.
- [ ] T040 [US1] Implement `apps/server/src/modules/teacher/dev/seed-demo.ts` (uses `ActivityService` for the Session and 2 Teams, Foundation repositories for Questions/Blanks/Groups; writes no `teacher_sheet_sources` or `teacher_blank_cells`) and `apps/server/src/modules/teacher/scripts/seed-demo.ts` (refuses `NODE_ENV=production`, uses `SQLITE_PATH`, runs migrations, prints the activity code). T026 passes.
- [ ] T041 [P] [US1] Create `apps/web/src/modules/teacher/error-messages.ts`, one table mapping every Teacher error code in `packages/contracts/src/teacher.ts` and `contracts/teacher-http-api.md` (including `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `INVALID_INPUT`, `SESSION_NOT_FOUND`, `TARGET_NOT_FOUND`, `INVALID_PHASE`, `STALE_STATE`, `NO_NEXT_TARGET`, `NO_QUESTIONS`, `TARGET_NOT_ANSWERABLE`, `INVALID_SHEET_URL`, `SHEET_NOT_SHARED`, `SHEET_NOT_FOUND`, `SHEET_FORMAT_INVALID`, `DUPLICATE_QUESTION_NUMBER`, `SHEETS_UNAVAILABLE`, `SHEETS_NOT_CONFIGURED`, `TEACHER_NOT_CONFIGURED`, `IMPORT_LOCKED`, `PREVIEW_CHANGED`, `NOT_IMPORTED`, `NOTHING_TO_WRITE`, `SHEET_CONFLICT`, `INTERNAL_ERROR`) to a Chinese on-screen message, with a generic fallback for unknown codes; never shows server `details` beyond cell addresses. Add `tests/web/teacher-error-messages.test.ts`: every code in the contracts union has a message, unknown code → fallback, no message contains a code-like secret or stack text.
- [ ] T042 [P] [US1] Implement `apps/web/src/modules/teacher/teacher-api-client.ts`: `credentials: 'same-origin'`, `X-CSRF-Token` from `/me` on every mutation, typed errors whose display text comes from `error-messages.ts`, refetch hook on 409, and on any 401 response redirect to `/teacher/login`.
- [ ] T043 [US1] Implement `apps/web/src/pages/teacher/TeacherLoginPage.tsx` and `apps/web/src/pages/teacher/TeacherDashboardPage.tsx` (activity list, create with team count, logout).
- [ ] T044 [US1] Implement `apps/web/src/pages/teacher/TeacherSessionPage.tsx` with `apps/web/src/modules/teacher/TargetList.tsx` and `apps/web/src/modules/teacher/RoundControlPanel.tsx`; watch state with `apps/web/src/services/session-state-client.ts` (no `auth.sessionId`), refetch detail on every state change and on 409; show errors with `error-messages.ts`. T027 passes.
- [ ] T045 [US1] 【需與學生端負責人協調】 Update `apps/web/src/app/router.tsx`: `/teacher/login` → `TeacherLoginPage`, `/teacher/dashboard` → `TeacherDashboardPage`, add `/teacher/sessions/:sessionId` → `TeacherSessionPage`.
- [ ] T046 [US1] 【需與學生端負責人協調】 Update the shared route tests that assert the Teacher placeholders, `apps/web/src/pages/placeholders.test.tsx` and `apps/web/src/app/router.test.tsx`, to expect the real Teacher pages (keep the Student assertions unchanged).
- [ ] T047 [US1] Write the US1 section of `tests/manual/teacher-feature.md`: seed demo, login/logout, create activity, two Student browsers, next/start/end/reopen, 2-second checks, Socket and cookie spot checks.
- [ ] T048 [US1] Run `npm.cmd run check`; run the US1 manual section with two Student browsers; record both in the quickstart Validation log and `tests/manual/teacher-feature.md`.

**Checkpoint**: P1 control works end-to-end without Google Sheets.

---

## Phase 4: User Story 2 — 老師監看與結果 (Priority: P1)

**Goal**: Teacher sees submitted Teams and order within 2 s (answers hidden until toggled) and full results after End.

**Independent Test**: Two Teams submit in sequence on the seeded activity; the monitor updates within 2 s, answers appear only after "顯示答案"; results show full order and winner, or no winner.

### Tests for User Story 2

- [ ] T049 [P] [US2] Write `tests/api/teacher-monitor.test.ts`: monitor lists every Team with `submitted`, `acceptedOrder`, `receivedAt`, per-blank answers; never draft data; Student cookie → 401; results only for Ended Rounds (409 `INVALID_PHASE` otherwise); winner from the Round's Result; replaced Rounds use the smallest `acceptedOrder`; no Submission → `winner: null`.
- [ ] T050 [P] [US2] Write `tests/web/teacher-monitor-panel.test.tsx` with fake timers: polls every 1 s only while Active, stops after Ended; answers hidden by default and shown after the "顯示答案" toggle; always shown on the results panel.

### Implementation for User Story 2

- [ ] T051 [US2] Implement `apps/server/src/modules/teacher/monitor/teacher-result-projection.ts` (monitor for current Round; results for any Round of the Session; round number = ordinal among Rounds of the same target by `created_at`).
- [ ] T052 [US2] Implement `apps/server/src/api/teacher/monitor-controller.ts` (`GET /sessions/:sessionId/monitor`, `GET /sessions/:sessionId/results?roundId=`) and register it. T049 passes.
- [ ] T053 [US2] Implement `apps/web/src/modules/teacher/MonitorPanel.tsx` and `apps/web/src/modules/teacher/ResultsPanel.tsx`, and add them to `TeacherSessionPage.tsx`. T050 passes.
- [ ] T054 [US2] Add the US2 section to `tests/manual/teacher-feature.md`; run `npm.cmd run check` and the manual section; record results.

**Checkpoint**: P1 (US1 + US2) complete — demoable with seeded data.

---

## Phase 5: User Story 3 — Guided Notes 匯入 (Priority: P2)

**Goal**: Teacher pastes a Google Sheets URL, previews numbers, groups and blank cells, and confirms to create questions.

**Independent Test**: With `FakeSheetsGateway`, both template transcriptions and the variants preview and import correctly; each error code is returned. Manually, a real shared sheet imports.

### Gate for User Story 3 and User Story 4

- [X] T055 [US3] Gate: after the larger group replies on the Teacher decisions (題組 = 題號直向合併跨多列; 一題多填空不算題組; 寫回保留「（1）」標記、答案接在後面), update the shared HackMD first, then `docs/shared-requirements.md` Q15, Q16, U06, U07 and U10 to the confirmed wording (Constitution I). If the group changes either decision, return to `/speckit-clarify` before continuing. T062 (parser) and T070 (cell composer) MUST NOT start until this task is done; other US3 tasks may proceed. **Done 2026-11-22**: the larger group confirmed both decisions unchanged; `docs/shared-requirements.md` Q13, Q15, Q16, U06, U07, U10 updated; the shared HackMD is updated manually by the user. T062 and T070 are unblocked.

### Tests for User Story 3

- [ ] T056 [P] [US3] Create fixtures in `tests/fixtures/guided-notes/`: transcriptions of both `docs/examples/` templates (values + merges, including spacer rows such as `B6:H6` and group merges `B5:B6`, `B8:B9`) and variants listed in `contracts/guided-notes-parser.md` (header moved and columns shifted, extra column, 8 questions with a two-marker cell, half-width markers, missing `作答` header, duplicate number, header only).
- [ ] T057 [P] [US3] Write `tests/unit/teacher-sheet-url.test.ts`: accepts `https://docs.google.com/spreadsheets/d/<id>/edit#gid=<n>` and `?gid=`; no gid → first tab; other hosts, short ids, or non-URLs → `INVALID_SHEET_URL`.
- [ ] T058 [P] [US3] Write `tests/unit/teacher-guided-notes-parser.test.ts` covering every fixture's expected output from `contracts/guided-notes-parser.md` (single template: 6 question targets, blanks at `G5`, `G7`, …; group template: 4 targets, 1 and 2 groups).
- [ ] T059 [P] [US3] Write `tests/api/teacher-import.test.ts` with the fake gateway: preview saves nothing; confirm creates Questions/Blanks/Groups and blank-cell rows matching the preview, with targets ordered by position; re-import before the first Round replaces previous data; after a Round → 409 `IMPORT_LOCKED`; sheet changed between preview and confirm → 409 `PREVIEW_CHANGED`; gateway errors map to `SHEET_NOT_SHARED` 403, `SHEET_NOT_FOUND` 404, `SHEETS_UNAVAILABLE` 502; no gateway → 503 `SHEETS_NOT_CONFIGURED`; `GET /me` shows the service-account email.

### Implementation for User Story 3

- [ ] T060 [P] [US3] Implement `apps/server/src/modules/teacher/sheets/sheets-gateway.ts` (interface and `HttpError` mapping helpers) and `tests/helpers/fake-sheets-gateway.ts` (in-memory sheets, recorded writes, injectable failures, cell change between reads).
- [ ] T061 [P] [US3] Implement `apps/server/src/modules/teacher/guided-notes/sheet-url.ts` to pass T057 (full URL never logged).
- [ ] T062 [P] [US3] Implement the pure parser `apps/server/src/modules/teacher/guided-notes/parser.ts` per `contracts/guided-notes-parser.md` to pass T058. It must not import anything from `modules/teacher/dev/`. Starts only after gate T055.
- [ ] T063 [US3] Implement `apps/server/src/modules/teacher/guided-notes/import-service.ts` (preview with `previewDigest`; confirm re-reads, compares digest, then in one transaction deletes previous imported data when no Round exists and inserts QuestionGroups, Questions, Blanks, `teacher_sheet_sources`, `teacher_blank_cells`).
- [ ] T064 [US3] Implement `apps/server/src/api/teacher/import-controller.ts` (`POST import/preview`, `POST import/confirm`), register it, and return `serviceAccountEmail` from `GET /me`. T059 passes.
- [ ] T065 [US3] Implement `apps/server/src/modules/teacher/sheets/google-sheets-gateway.ts` with `googleapis` (`GoogleAuth` key file, scope `spreadsheets`, `spreadsheets.get` for merges, `values.get` FORMATTED_VALUE, `values.batchGet`, atomic `batchUpdate`, 10 s timeout, error mapping without Google bodies), and select it in `integration.ts` only when `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` is configured.
- [ ] T066 [US3] Implement `apps/web/src/modules/teacher/ImportWizard.tsx` (service-account email and sharing steps, URL input, preview table of numbers/groups/cells, confirm/cancel, error messages per code from `error-messages.ts`) and add it to `TeacherSessionPage.tsx`.
- [ ] T067 [US3] Add the US3 section to `tests/manual/teacher-feature.md` (real sheets: both templates and a modified copy; not-shared and wrong-URL cases; record the time from pressing preview to the preview appearing for each sheet, against the 5-second plan goal); run `npm.cmd run check` and the manual section; record results.

**Checkpoint**: P2 complete — real Guided Notes drive the quiz.

---

## Phase 6: User Story 4 — 答案寫回 Guided Notes (Priority: P3)

**Goal**: One write-back of all winners (and restores), confirmed first, all-or-nothing.

**Independent Test**: Fake gateway covers composition, restore and conflict; manually, a real sheet shows `（1）<answer>`.

### Tests for User Story 4

- [ ] T068 [P] [US4] Write `tests/unit/teacher-cell-composer.test.ts`: `（1）` + `CPU` → `（1）CPU`; empty cell → answer; marker-less non-empty original → answer; two markers in one cell each followed by its answer; half-width markers; restore returns the original.
- [ ] T069 [P] [US4] Write `tests/api/teacher-write-back.test.ts`: preview covers every target with a winner plus restore entries for previously written targets now without a winner; untouched targets absent; expected content = `last_written_content ?? original_content`; confirm writes once and updates `last_written_content`; after a reopen produces a new winner, the next write-back replaces the previously written answer (`（1）CPU` → `（1）GPU`, not appended); a changed or missing cell → 409 `SHEET_CONFLICT` with `details.cells`, nothing written; results changed after preview → 409 `STALE_STATE`; nothing to write → 409 `NOTHING_TO_WRITE`; seeded (not imported) activity → 409 `NOT_IMPORTED`.

### Implementation for User Story 4

- [ ] T070 [P] [US4] Implement the pure `apps/server/src/modules/teacher/write-back/cell-composer.ts` to pass T068. Starts only after gate T055.
- [ ] T071 [US4] Implement `apps/server/src/modules/teacher/write-back/write-back-service.ts` (plan from current results and blank-cell rows, `planDigest`, re-read, compare, one `writeCells` batch, then update `last_written_content`/`last_written_at`).
- [ ] T072 [US4] Implement `apps/server/src/api/teacher/write-back-controller.ts` (`POST write-back/preview`, `POST write-back/confirm`) and register it. T069 passes.
- [ ] T073 [US4] Implement `apps/web/src/modules/teacher/WriteBackDialog.tsx` (entry table with current → new content and write/restore kind, confirm, conflict list) and add it to `TeacherSessionPage.tsx`.
- [ ] T074 [US4] Add the US4 section to `tests/manual/teacher-feature.md` (real sheet write, marker kept, conflict after a manual edit, restore after a no-winner reopen); run `npm.cmd run check` and the manual section; record results.

**Checkpoint**: P3 complete.

---

## Phase 7: User Story 5 — CSV 匯出 (Priority: P4)

**Goal**: Download the activity record as CSV.

**Independent Test**: Export after reopen and a non-submitting Team; rows = Rounds × Teams; opens correctly in Excel and Google Sheets.

### Tests for User Story 5

- [ ] T075 [P] [US5] Write `tests/unit/teacher-csv.test.ts`: UTF-8 BOM, CRLF, RFC 4180 quoting of commas/quotes/newlines, cells starting with `=`, `+`, `-`, `@` prefixed with `'`, `是`/`否`, time `YYYY-MM-DD HH:mm:ss` in `Asia/Taipei`.
- [ ] T076 [P] [US5] Write `tests/api/teacher-export.test.ts`: header `題號,第幾輪,組別,答案,順位,是否勝出,送出時間`; one row per Round × Team; reopened target lists both rounds with different `第幾輪`; non-submitter has empty answer/order/time and `否`; answers joined like `（1）CPU；（2）OS`; `Content-Disposition` filename `activity-<code>.csv`; unauthenticated → 401.

### Implementation for User Story 5

- [ ] T077 [P] [US5] Implement the pure `apps/server/src/modules/teacher/export/csv-writer.ts` to pass T075.
- [ ] T078 [US5] Implement `apps/server/src/modules/teacher/export/activity-record-service.ts` (rows from Rounds × Teams using `teacher-result-projection.ts`).
- [ ] T079 [US5] Implement `apps/server/src/api/teacher/export-controller.ts` (`GET /sessions/:sessionId/export.csv`) and register it. T076 passes.
- [ ] T080 [US5] Add an export button in `apps/web/src/modules/teacher/ExportButton.tsx` and place it on `TeacherSessionPage.tsx`.
- [ ] T081 [US5] Add the US5 section to `tests/manual/teacher-feature.md` (open in Excel and Google Sheets); run `npm.cmd run check` and the manual section; record results.

**Checkpoint**: All five stories complete.

---

## Phase 8: Polish and cross-cutting

- [ ] T082 [P] Create `specs/003-teacher-feature/traceability.md` mapping every FR-001–FR-040 and SC-001–SC-009 to tasks and test files; mark anything only covered manually.
- [ ] T083 [P] Security sweep, recorded in `specs/003-teacher-feature/quickstart.md`: no password, hash, secret, CSRF token, cookie value or key path in logs or responses (grep the code under `apps/server/src/modules/teacher/` and `apps/server/src/api/teacher/` for `console.`); `git ls-files` contains no `.env` or service-account JSON.
- [ ] T084 Compare the implementation with `diagrams/003-teacher-feature-component.puml`, `-class.puml`, `-sequence.puml`; update the diagrams for any difference; run `java -jar plantuml.jar "./diagrams/*.puml"`, check each `.puml` has a readable PNG, then `git restore -- diagrams/002-student-feature-*.png diagrams/foundation-*.png`. Record the comparison in `specs/003-teacher-feature/quickstart.md`.
- [ ] T085 Run the full demo in `tests/manual/teacher-feature.md` with three browser profiles (Teacher, two Teams), within 5 minutes (SC-009). Also time SC-001 separately: from submitting the login form to the first round becoming Active (login → create activity → import → next → start), target 3 minutes; record the measured time. Record actual results and anything not run.
- [ ] T086 Final `npm.cmd run check`; record TypeScript, test and build results, including Foundation and Student regression suites, in the quickstart Validation log.

---

## Dependencies and Execution Order

### Phase dependencies

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7 (US5) → Phase 8.
- The last task of each phase (`npm.cmd run check`) gates the next phase.
- Coordination tasks (T003, T004, T008, T014, T015, T045, T046) need the Student owner's agreement before merge; work on the dependent tasks can proceed locally on `feature/teacher`.

### Story dependencies

- **US1**: needs Phase 2. No dependency on other stories (uses `teacher:seed-demo` instead of import).
- **US2**: needs US1 (login, activity, round control) to produce Rounds and Submissions.
- **US3**: needs Phase 2 and US1's auth/activity; independent of US2. The US3/US4 gate task (T055) must be done before T062 and T070 start.
- **US4**: needs US3 (blank-cell mapping) and US2's result projection.
- **US5**: needs US2's result projection; independent of US3/US4.

### Within each story

Tests first (must fail), then pure modules, then services, then controllers, then UI, then manual check.

## Parallel Opportunities

- Phase 1: T001, T002, T004 together.
- Phase 2: T009 and T011 alongside T006/T007.
- US1 tests T018–T027 all in parallel; pure modules T028–T031 in parallel; T039, T041 and T042 in parallel with server work.
- US3: T056–T059 in parallel; T060–T062 in parallel.
- US4: T068, T069, T070 in parallel. US5: T075, T076, T077 in parallel.
- Polish: T082, T083 in parallel.

## Parallel Example: User Story 1

```text
Together: T018 password tests, T019 CSRF tests, T020 rate-limit tests, T021 auth API tests,
          T022 activity tests, T023 rounds tests, T024 end integration, T025 socket tests,
          T026 seed-demo tests, T027 web page tests
Then together: T028 password hash, T029 hash script, T030 CSRF, T031 rate limiter, T039 demo data, T041 error messages, T042 web API client
```

## Implementation Strategy

### MVP first

Phases 1–4 (US1 + US2): login, activity, round control, monitor and results with the seeded demo activity. This is a complete classroom demo without Google Sheets.

### Incremental delivery

1. Phases 1–2 → foundation; check passes.
2. US1 → control demo with `teacher:seed-demo`.
3. US2 → monitor and results (MVP).
4. US3 → real Guided Notes import.
5. US4 → write-back.
6. US5 → CSV.
7. Polish → traceability, security sweep, diagrams, final demo.

## Notes

- Do not modify `apps/server/src/app.ts`, `apps/server/src/api/router.ts`, `apps/server/src/config/env.ts`, migrations 001–005, or any Student/Foundation module.
- The demo data in `apps/server/src/modules/teacher/dev/` is development-only; the import flow must never read it (enforced by T026).
- Automated tests never call Google; real Sheets are manual tests only.
- Do not commit `.env`, keys, `plantuml.jar` or local SQLite files.
