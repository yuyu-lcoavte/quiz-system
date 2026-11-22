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
| Write-back | `tests/unit/teacher-cell-composer.test.ts`, `tests/api/teacher-write-back.test.ts` | `（1）` + `CPU` → `（1）CPU`; empty cell → answer; two markers in one cell; rewrite after reopen replaces; restore after no-winner reopen; conflict → nothing written; stale plan → 409 |
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
