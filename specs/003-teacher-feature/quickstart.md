# Quickstart: Teacher Feature Validation

Run from the repository root on Windows (PowerShell, `npm.cmd`). This guide describes how to validate the feature once it is implemented; no results are recorded here yet.

## Prerequisites

- Node.js 22.12+ and `npm.cmd ci` completed.
- Java 17+ and `plantuml.jar` in the repository root (gitignored) for diagrams.
- For P2/P3 manual tests only: a Google Cloud service account with the Google Sheets API enabled, its JSON key saved **outside** the repository, and a copy of each `docs/examples/` template uploaded to Google Sheets.

## Configuration

1. Copy `.env.example` to `.env` (never commit `.env`).
2. Generate the password hash (prompts for the password, prints only the hash):

   ```powershell
   npm.cmd run teacher:hash-password
   ```

3. Fill `.env`:
   - `TEACHER_PASSWORD_HASH=<printed hash>`
   - `TEACHER_SESSION_SECRET=<at least 32 random bytes>`
   - `TEACHER_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`
   - `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=C:\path\outside\repo\service-account.json` (optional; without it import and write-back return 503 `SHEETS_NOT_CONFIGURED` and P1 still works)
   - Existing Student variables (`STUDENT_CSRF_SECRET`, `STUDENT_ALLOWED_ORIGINS`) as before.
4. Share each test spreadsheet with the service-account email shown on the import page (Editor access, needed for write-back).

## Development demo data (P1 without Google Sheets)

```powershell
npm.cmd run teacher:seed-demo
```

Creates, in the local database configured by `SQLITE_PATH`, one activity with 2 Teams (`第1組`, `第2組`) and questions shaped like the `docs/examples/` question-group template: numbers 1–4, where 1 and 2 are groups of two questions (blanks `（1）`, `（2）`) and 3 and 4 are single questions. It prints the activity code.

- The data lives only in `apps/server/src/modules/teacher/dev/demo-guided-notes.dev.ts`, marked development-only. The Guided Notes import flow never reads it (checked by `tests/unit/teacher-seed-demo.test.ts`).
- The command refuses to run when `NODE_ENV=production`.
- The seeded activity has no Google Sheets source, so write-back returns 409 `NOT_IMPORTED` for it; use an imported activity to test P3.

## Automated checks

```powershell
npm.cmd run check
```

Expected: typecheck, all Vitest suites (Foundation, Student and the new `teacher-*` suites) and build pass. Teacher suites use a temporary SQLite file and `FakeSheetsGateway`; they never call Google.

| Area | Suites | Key cases |
|---|---|---|
| Auth and security | `tests/unit/teacher-password.test.ts`, `tests/api/teacher-auth.test.ts`, `tests/realtime/teacher-socket.test.ts` | hash verify; login success/failure/429; cookie tamper, expiry, logout on one device only; Origin and CSRF on every mutation; Teacher cookie gives no identity on shared `/sessions/:id/...`; Socket Origin, cookie and Student-path isolation |
| Activities and rounds | `tests/api/teacher-activity.test.ts`, `tests/api/teacher-rounds.test.ts`, `tests/integration/teacher-end.test.ts` | code format and uniqueness; Teams `第1組`…; select/next/start/end; wrong phase 409; stale version 409; empty group and zero-blank targets rejected; reopen replaces result, reopen with no submissions clears it; Submit-vs-End consistency through the real coordinator |
| Monitor and results | `tests/api/teacher-monitor.test.ts` | submitted/not submitted, order, answers; no drafts; Student cookie 401 |
| Parser | `tests/unit/teacher-guided-notes-parser.test.ts` | all fixtures in [contracts/guided-notes-parser.md](contracts/guided-notes-parser.md) |
| Import | `tests/api/teacher-import.test.ts` | preview saves nothing; confirm creates matching Questions/Blanks/Groups; each sheet error code; `PREVIEW_CHANGED`; `IMPORT_LOCKED` after first Round |
| Write-back | `tests/unit/teacher-cell-composer.test.ts`, `tests/api/teacher-write-back.test.ts` | fill cell H5 gets `CPU` while G5 `（1）` stays; marker-cell fallback `（1）` + `CPU` → `（1）CPU`; empty cell → answer; two markers in one cell; rewrite after reopen replaces; restore after no-winner reopen; conflict → nothing written; stale plan → 409 |
| CSV | `tests/unit/teacher-csv.test.ts`, `tests/api/teacher-export.test.ts` | BOM, CRLF, quoting, Asia/Taipei time, formula-injection prefix, rows = Rounds × Teams, non-submitters empty |

## Manual end-to-end (demo script)

Start the app with `npm.cmd run dev`. For a P1-only run, seed the demo activity first (see above) and skip steps 3 and 6. Use three separate browser profiles or incognito windows: Teacher, Team 1 student, Team 2 student.

1. **Login**: open `http://127.0.0.1:5173/teacher/login`, wrong password shows an error, correct password opens the dashboard.
2. **Create activity**: 2 Teams → note the activity code; students join `第1組` and `第2組` from the dropdown.
3. **Import (P2)**: paste the question-group template's Sheets URL; preview shows 4 numbers, groups 1 and 2 with two questions each, and cell addresses; confirm. Repeat on a new activity with a modified copy (header moved, extra questions) and check the preview again.
4. **Control (P1)**: "下一題" → students see Waiting within 2 s; start → students see the target; Team 2 submits, then Team 1; Teacher monitor shows both within 2 s, answers hidden until "顯示答案"; end → both students see Ended and the result names Team 2.
5. **Reopen**: select question 1 again, start, end with no submissions → result shows no winner.
6. **Write-back (P3)**: preview lists cells with `（1）<answer>` and a restore entry for question 1; edit one listed cell in Google Sheets, confirm → conflict, nothing written; preview again, confirm → cells updated, markers kept.
7. **Export (P4)**: download the CSV, open in Excel and Google Sheets; Chinese readable; rows = Rounds × Teams.
8. **Security spot checks**: log out in the Teacher window, an old tab's next action is rejected; the Student windows cannot open any `/api/v1/teacher/...` URL (401).

Record actual results and anything not run in `tests/manual/teacher-feature.md`; manual results are not inferred from automated runs.

## Diagrams

```powershell
java -jar plantuml.jar "./diagrams/*.puml"
```

Check that each `.puml` has a PNG beside it and the three `003-teacher-feature-*` PNGs open and read clearly. The command re-renders every Feature's PNG; restore the other Features' PNGs before committing:

```powershell
git restore -- diagrams/002-student-feature-*.png diagrams/foundation-*.png
```

## Validation log

Actual results only; anything not run is listed as not run.

| Date | Phase | Command | Result |
|---|---|---|---|
| 2026-11-22 | Baseline (before Teacher code) | `npm.cmd run check` | Pass: typecheck, 47 test files / 231 tests, build. |
| 2026-11-22 | Phase 1 (T001–T004) | `npm.cmd run check` | Pass: typecheck, 48 test files / 238 tests (+7 `teacher-contracts`), build. `teacher-contracts.test.ts` first failed because `teacher.ts` did not exist, then passed. |
| 2026-11-22 | Phase 2 (T006–T016) | `npm.cmd run check` | Pass: typecheck, 52 test files / 261 tests, build. New suites `teacher-migration`, `teacher-repositories`, `teacher-config`, `teacher-router` each failed first for the expected reason (missing table or module), then passed. Shared `migration-location.test.ts` failed only because 006 was missing from its list (T008), then passed. |
| 2026-11-22 | Phase 2 (T017) boot | `tsx src/main.ts` with `PORT=3901`, temporary `SQLITE_PATH`, no `.env` | Pass: server listened through `src/main.ts`, migrations ran, `GET /api/v1/teacher/does-not-exist` → 404 `TARGET_NOT_FOUND`; startup reports Teacher login and Google Sheets not configured. `npm.cmd run dev` (watch mode with Vite) not run. `loginAsTeacher()` in `tests/helpers/teacher.ts` is not exercised until the US1 auth routes exist. |
| 2026-11-22 | Phase 3 (T018–T046) | `npm.cmd run check` | Pass: typecheck, 63 test files / 332 tests, build. First full run failed with 7 timeouts (4 Student suites + 3 `teacher-end`) because every Teacher test login ran a full scrypt (N=32768); `verifyPassword` now accepts power-of-two N from 2^10 to 2^15 and the test helper uses N=1024, after which all suites pass in 22 s. Shared `placeholders.test.tsx` / `router.test.tsx` pass unchanged against the real Teacher pages (T046). |
| 2026-11-22 | Phase 3 manual (T048) | `tests/manual/teacher-feature.md` US1 1.1–1.17, three browsers, seeded demo activity | 16 of 17 pass. 1.9 fails only because the Teacher page shows no winner after End; that is FR-024 (US2 ResultsPanel), recorded as 留待 US2 驗證 and moved to US2 step 2.4. |
| 2026-11-22 | Phase 4 (T049–T053) | `npm.cmd run check` | Pass: typecheck, 65 test files / 344 tests, build. `teacher-monitor` (API, real Student join/submit, drafts never exposed) and `teacher-monitor-panel` (1 s polling only while Active, answers hidden until toggled, results/無勝者) failed first for the expected reasons, then passed. US2 manual (T054) not run yet. |
| 2026-11-22 | Phase 4 manual (T054) | `tests/manual/teacher-feature.md` US2 2.1–2.7, same three browsers | All 7 pass, including 2.4 (moved from US1.9: full order, winner 第2組 with 「（1）1；（2）11」) and 2.6 (第1組's Network shows no 第2組 data). US1.9 student side also confirmed (both Teams 已結束, 第2組 winner). One issue: 作答狀況 still showed 「（已隱藏）」 after End (FR-022). |
| 2026-11-23 | Phase 4 fix | `npm.cmd run check` | Pass: typecheck, 65 test files / 346 tests, build. MonitorPanel now always shows answers once Ended and hides the toggle; two new tests failed first, then passed. Not re-checked by hand. |
| 2026-11-23 | Phase 5 (T056–T066) | `npm.cmd run check` | Pass: typecheck, 70 test files / 392 tests, build. New suites `teacher-sheet-url`, `teacher-guided-notes-parser` (both templates transcribed + 8 variants), `teacher-import` (fake gateway), `teacher-google-sheets-gateway` (recording Sheets API stand-in, no network) and `teacher-import-wizard` each failed first for the expected reason, then passed. One test fix: the import login test first lacked an Origin and got 403 (Origin check runs before login, as designed). No real Google call made; US3 manual (T067) not run yet. |
| 2026-11-23 | Phase 5 manual (T067) | `tests/manual/teacher-feature.md` US3 3.1–3.12 with real Google Sheets and a service account | All 12 pass. Preview about 2 s for 3.3/3.4/3.5 (goal ≤ 5 s). Moved layout (3.4) parsed correctly; imported group question played by two Teams (3.12, winner 第2組 「（1）1111；（2）22」). Also re-checked the US2 fix by hand: answers shown after End, no toggle. |
| 2026-11-23 | T087 highlight + Phase 6 (T068–T073) | `npm.cmd run check` | Pass: typecheck, 74 test files / 416 tests, build. `teacher-cell-composer`, `teacher-write-back` (fake gateway: write, rewrite after reopen, restore, conflict, missing cell, stale plan, NOTHING_TO_WRITE, NOT_IMPORTED) and `teacher-write-back-dialog` failed first, then passed. The first full run failed the test typecheck on `teacher-target-list.test.tsx` (committed in the T087 commit without running the test typecheck); fixed by typing the rows. US4 manual (T074) not run yet. |
| 2026-11-23 | US4 manual first run (T074, partial) | `tests/manual/teacher-feature.md` 4.1–4.3 | 4.1, 4.2 pass. 4.3 wrote G5 「（1）CPU」/G6 「（2）OS」/G11 「42」: matched the document then, but not the template's fill cells (H5/H6). Led to the Q16 clarification (T088–T091). 4.4–4.8 not run; 3.3/4.2/4.3 need a re-run. |
| 2026-11-23 | Q16 fill-cell clarification (T088–T091) | `npm.cmd run check` | Pass: typecheck, 74 test files / 417 tests, build. Updated parser/import/write-back/wizard tests failed first (12 failures: group template now H5/H6/H8/H9, shifted variant K3/K4, write-back targets H5/H6, preview 「G5（1）→H5」) while the single template, two-marker cell and half-width cases kept passing; then all passed. Write-back service needed no code change (a fill cell's original is empty). Diagrams unchanged. |
| 2026-11-23 | US4 manual re-run (T074) | `tests/manual/teacher-feature.md` 3.3 and 4.1–4.8, fresh sheet copy re-imported after the Q16 fix | All pass: preview G5（1）→H5…; H5/H6 written, G5/G6 unchanged; reopen replaced (GPU/RAM), no-winner restore emptied G11; conflict wrote nothing and succeeded after the cell was put back; unshared → not-shared message; seed-demo activity has no write-back button. |
| 2026-11-23 | Phase 7 (T075–T080) | `npm.cmd run check` | Pass: typecheck, 77 test files / 427 tests, build. `teacher-csv` (BOM, CRLF, quoting, formula prefix, Asia/Taipei time), `teacher-export` (Rounds × Teams, reopened rounds, non-submitters, group answers, filename, 401) and `teacher-export-button` failed first for the expected reasons, then passed. US5 manual (T081) not run yet. |
