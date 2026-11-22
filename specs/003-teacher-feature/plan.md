# Implementation Plan: Teacher Feature

**Branch**: `feature/teacher` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-teacher-feature/spec.md`

## Summary

Add the Teacher module to the existing single application. The server side plugs into the reserved `createTeacherRouter(services)` hook and Socket identity options in `apps/server/src/app.ts`, mounted at `/api/v1/teacher`. It reuses Foundation's Session/Team/Round/Question/Blank/QuestionGroup/Result tables and `SessionLifecycleService`, and ends rounds only through `StudentTrustedEndCoordinator.endRound(...)`. Teacher-only state (login sessions, Google Sheets source, blank-to-cell mapping) goes into additive migration `006-teacher-feature.sql`. Teacher login uses a scrypt hash in `.env`, a signed HttpOnly cookie backed by a server-side session row, exact Origin checks and HMAC CSRF tokens. Live monitoring polls a Teacher-only endpoint every second, so no Student code changes. Guided Notes import and write-back go through a `SheetsGateway` (googleapis + service account) and a pure parser function. Work is delivered P1 → P2 → P3 → P4. Technical decisions and alternatives: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript; Node.js 22.12+ (as Foundation).

**Primary Dependencies**: Existing React 19, React Router 7, Vite 7, Tailwind CSS 4, Express 5, Socket.IO 4, `better-sqlite3`, `cookie`, Vitest, Supertest, `socket.io-client`. New: `googleapis` (server only; R11). Password hashing and HMAC use built-in `node:crypto`.

**Storage**: Shared SQLite database and migration runner. Additive `006-teacher-feature.sql`; migrations 001–005 untouched. Foundation rows stay authoritative.

**Testing**: Vitest unit tests (parser, write-back composer, CSV, password hash, CSRF); Supertest API tests against a temporary SQLite file with a fake `SheetsGateway`; Socket.IO client tests for Teacher watch authorization and Student-path isolation; manual tests with a real Google Sheet and two Student browsers.

**Target Platform**: Windows local development and classroom demo; no public deployment.

**Project Type**: Existing npm-workspaces web application (`apps/web`, `apps/server`, `packages/contracts`).

**Performance Goals**: State changes visible within 2 s (Foundation event); new submissions visible to the Teacher within 2 s (1 s polling, R6); import preview of a typical Guided Notes (≤100 rows) within 5 s including the Google request.

**Constraints**: No second backend, database or realtime system. No edits to `app.ts`, `api/router.ts`, migrations 001–005 or Student code. Secrets only in `.env` or a key file outside the repo. Teacher identity only on `/api/v1/teacher/...` and the Teacher Socket path (section 5 of `docs/integration/student-teacher-decisions.md`).

**Scale/Scope**: One teacher; several activities; up to 20 Teams per activity; Guided Notes with dynamic question, group and blank counts.

All earlier unknowns are resolved in [research.md](research.md); none remain marked NEEDS CLARIFICATION.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Initial gate | Post-design |
|---|---|---|
| I. 需求一致性 | Pass. Follows the clarified spec; Q16/U07 and U06/U10 Teacher decisions are recorded as sent to the larger group, not treated as group-confirmed. | Pass. |
| II. 模組化與協作 | Pass with coordination items. Teacher code lives in its own folders; reuses Foundation and Student through the reserved hook. Shared-file edits are listed under **Coordination** below and are additive. | Pass. No Foundation or Student contract changes. |
| III. Git 與 AI 界線 | Pass. Work on `feature/teacher`; no commit or push without the user's say-so. | Pass. |
| IV. 資料正確性與安全 | Pass. Backend validates every input, including Google Sheets data; no hard-coded cell positions; Teacher authority checked on the server; password hash, session secret and service-account key only in `.env` / an out-of-repo key file; nothing secret logged. | Pass. Cookie + server session row, Origin, CSRF, login rate limit, Socket path isolation and CSV formula-injection guard specified in contracts. |
| V. 測試與品質證據 | Pass at planning level. Normal and error cases planned per story; fake gateway for automation, real Sheets and two-Student demo as manual tests. No tests claimed as run. | Pass. |
| VI. Diagram First | Pass. Three `003-teacher-feature-*` diagrams refined to this plan and re-rendered with `java -jar plantuml.jar "./diagrams/*.puml"`. | Pass after PNG check (see quickstart). |
| VII. 階段紀律 | Pass. Plan only; no `tasks.md` and no application code. | Pass. |

No constitution exceptions are requested.

## Architecture

### Server composition

1. New entry `apps/server/src/main.ts` loads Teacher config and calls `startServer(createTeacherIntegration(config))` (R2).
2. `createTeacherIntegration` returns:
   - `createTeacherRouter(services)`: builds Teacher services from `services.database`, `services.sessionLifecycle`, `services.endCoordinator` and the `SheetsGateway`, and returns the Express router mounted at `/api/v1/teacher`.
   - `resolveSocketActorContext` / `authorizeWatch`: Teacher Socket identity (R5).
   - It does **not** set `resolveActorContext`.
3. Inside the Teacher router (order matters):
   1. `teacherOrigin` on every non-GET request.
   2. `POST /auth/login`: rate limit, password check, create session row, set cookie.
   3. `teacherAuth` on everything else: verify cookie signature and session row.
   4. `teacherCsrf` on every non-GET request after login.
   5. `/sessions/:sessionId/*`: check the Session exists, attach the per-request Teacher `ActorContext` (R5).

### Module layout

```text
apps/server/src/
├── main.ts                              # NEW entry: startServer(createTeacherIntegration())
├── api/teacher/
│   ├── teacher-router.ts                # createTeacherRouter(services)
│   ├── auth-controller.ts               # login / logout / me
│   ├── activity-controller.ts           # list / create / detail
│   ├── round-controller.ts              # select / next / start / end
│   ├── monitor-controller.ts            # monitor / results
│   ├── import-controller.ts             # preview / confirm
│   ├── write-back-controller.ts         # preview / confirm
│   ├── export-controller.ts             # CSV
│   └── middleware/                      # teacher-origin, teacher-auth, teacher-csrf, login-rate-limit, session-scope
└── modules/teacher/
    ├── config.ts                        # TEACHER_* and GOOGLE_* parsing
    ├── integration.ts                   # createTeacherIntegration()
    ├── auth/                            # password-hash, login-session-service, csrf, socket-identity
    ├── activity/                        # activity-service (code + Teams)
    ├── rounds/                          # target-catalog (targets, status, next), round-control-service
    ├── monitor/                         # teacher-result-projection
    ├── guided-notes/                    # parser (pure), import-service, sheet-url
    ├── sheets/                          # sheets-gateway interface, googleapis gateway, fake gateway (tests)
    ├── write-back/                      # cell-composer (pure), write-back-service
    ├── export/                          # csv-writer (pure), activity-record-service
    ├── persistence/                     # teacher repositories over 006 tables
    └── scripts/hash-password.ts         # npm run teacher:hash-password

apps/server/src/persistence/migrations/006-teacher-feature.sql   # NEW

apps/web/src/
├── pages/teacher/                       # TeacherLoginPage, TeacherDashboardPage, TeacherSessionPage
└── modules/teacher/                     # teacher-api-client (CSRF header), control panel, monitor panel,
                                         # results panel, import wizard, write-back dialog, export button

packages/contracts/src/teacher.ts        # NEW Teacher DTOs (exported from index.ts)

tests/
├── unit/teacher-*.test.ts               # parser, cell composer, CSV, password hash, CSRF, sheet URL
├── api/teacher-*.test.ts                # auth, activity, rounds, monitor, import, write-back, export
├── integration/teacher-*.test.ts        # end with coordinator, Student submit + Teacher end
├── realtime/teacher-socket.test.ts      # watch authorization, Student path isolation
├── fixtures/guided-notes/               # template transcriptions and variants
└── manual/teacher-feature.md            # real Google Sheet + two Students demo script
```

### Data flow by story

- **P1 login and control**: login → session row + cookie → `GET /me` gives CSRF token → create activity (Session + Teams in one transaction) → select/next (Teacher checks blanks ≥ 1, then `sessionLifecycle.selectTarget`) → start (`sessionLifecycle.startRound`) → end (`endCoordinator.endRound`, single call). Foundation publishes `session:state:changed` after each commit; Teacher and Student pages update from it.
- **P1 monitor and results**: Teacher page polls `GET …/monitor` every 1 s while Active; after Ended, `GET …/results` returns full order and winner. Projections read Foundation tables only; drafts are never read.
- **P2 import**: `POST …/import/preview` (URL) → gateway reads values + merges → `parseGuidedNotes` → preview with cell addresses, nothing saved → `POST …/import/confirm` re-reads and re-parses, checks the result equals the preview digest, then creates Questions, Blanks, Groups and blank-cell rows in one transaction (only while the Session has no Round).
- **P3 write-back**: `POST …/write-back/preview` → plan + digest → `POST …/write-back/confirm` → re-read cells → all-or-nothing batch write → update `last_written_content`.
- **P4 export**: `GET …/export.csv` → activity record rows → CSV writer.

## Coordination with the Student / Foundation owner

The reserved hook covers routing and services. These **shared files** still need small additive edits; each is marked **需與學生端負責人協調** and is a task of its own:

| File | Change | Reason |
|---|---|---|
| `apps/server/package.json` | `dev` script → `tsx watch src/main.ts`; add `googleapis` dependency; add `teacher:hash-password` script | The current entry `src/app.ts` starts the server without Teacher integration (R2); Sheets access (R11). |
| `package.json` (root) | add `teacher:hash-password` forwarding to the server workspace | Requested npm command for generating the hash. |
| `apps/web/src/app/router.tsx` | replace the two Teacher placeholder elements; add `/teacher/sessions/:sessionId` | Teacher pages (R14). |
| `packages/contracts/src/index.ts` | add `export * from './teacher.js';` | Teacher DTOs (R15). |
| `.env.example` (root, new) | placeholder values for all variables | Requested; no real values. |

Not changed: `apps/server/src/app.ts`, `apps/server/src/api/router.ts`, `apps/server/src/config/env.ts`, migrations 001–005, Student and Foundation modules, `.gitignore` (already ignores `.env`).

## Delivery Order

1. **P1** (independent): migration 006 (login sessions only needed first), config, auth, activity, target catalog and round control, monitor/results, Socket identity, Teacher pages for login/dashboard/session control. Integrate with two Student clients using seeded questions.
2. **P2**: sheet URL parsing, parser + fixtures, gateway (fake + googleapis), import preview/confirm, import wizard.
3. **P3**: cell composer, write-back service, write-back dialog.
4. **P4**: CSV writer and export button.

Each phase ends with its tests passing and its manual check in [quickstart.md](quickstart.md).

## Project Structure

### Documentation (this feature)

```text
specs/003-teacher-feature/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── teacher-http-api.md
│   ├── teacher-realtime.md
│   ├── guided-notes-parser.md
│   └── sheets-gateway.md
└── checklists/requirements.md
```

### Diagrams

`diagrams/003-teacher-feature-component.puml`, `-class.puml`, `-sequence.puml`, refined to the module layout above and rendered to PNG beside each source.

## Complexity Tracking

No constitution violations. The extra entry file (`main.ts`) and the shared-file edits listed under Coordination are the minimum needed to start the server with Teacher integration, add the Sheets dependency, and register Teacher pages.
