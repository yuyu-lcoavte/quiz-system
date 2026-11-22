# Research: Teacher Feature

**Date**: 2026-11-22 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Each entry records a decision, why it was chosen, and the alternatives rejected. All Technical Context unknowns are resolved here.

## R1. Composition with Foundation and Student

- **Decision**: Teacher code plugs in only through the existing `TeacherIntegrationOptions` seam in `apps/server/src/app.ts`:
  - `createTeacherRouter(services)` receives `{ database, sessionLifecycle, endCoordinator }` and returns the Teacher router, which `apps/server/src/api/router.ts` mounts at `/api/v1/teacher`.
  - `resolveSocketActorContext` and `authorizeWatch` supply Teacher Socket identity.
  - Teacher does **not** supply the global `resolveActorContext`; Teacher HTTP identity is built inside the Teacher router, so shared `/api/v1/sessions/:id/...` reads never see a Teacher context (section 5, R7 decision).
- **Rationale**: Uses the hook the Student owner reserved, so `app.ts` and `router.ts` stay unchanged. Building identity inside the Teacher router matches the "teacher-only paths" rule without depending on path regexes in the global resolver.
- **Alternatives rejected**: A global `resolveActorContext` limited to `/teacher/` paths (works, but adds a second place where path rules live); editing `app.ts` (owned by the Student owner).

## R2. Server entry point

- **Decision**: Add `apps/server/src/main.ts`, which calls `startServer(createTeacherIntegration(config))`, and point the `@quiz/server` `dev` script at `src/main.ts`. **Needs coordination with the Student owner** (`apps/server/package.json` is shared). `app.ts`'s own `if (entryPath === …) startServer()` block stays as is; it keeps starting a server without Teacher authority.
- **Rationale**: `startServer()` already accepts Teacher options, but the current entry passes none. A separate entry avoids touching `app.ts`.
- **Alternatives rejected**: Changing the entry block in `app.ts` (Student-owned file); a second server process (forbidden: no second backend).

## R3. Teacher password and login session

- **Decision**:
  - Password hash: Node `crypto.scrypt`, stored as `scrypt$N$r$p$<saltB64>$<hashB64>` (N=2^15, r=8, p=1, 16-byte salt, 64-byte key) in `TEACHER_PASSWORD_HASH`. Verified with `timingSafeEqual`.
  - Hash tool: `npm run teacher:hash-password` reads the password from a hidden prompt (stdin, no echo), never from command arguments, and prints only the hash.
  - Login session: a random 32-byte session id is stored server-side as a SHA-256 digest in `teacher_login_sessions` (issued, expires +8 h, revoked). The cookie value is `<id>.<HMAC-SHA256(TEACHER_SESSION_SECRET, id)>`.
  - Cookie `teacher_session`: `HttpOnly`, `SameSite=Strict`, `Path=/` (needed for both `/api/v1/teacher` and `/socket.io`), `Secure` when `NODE_ENV=production`, `Max-Age=28800`.
  - Logout revokes that row and clears the cookie; other devices keep their own rows.
- **Rationale**: Signed cookie as requested; the server-side row makes logout and expiry enforceable even if a cookie value was copied. `SameSite=Strict` is acceptable because the Teacher pages are same-origin.
- **Alternatives rejected**: Stateless signed cookie only (logout could not invalidate a copied cookie); bcrypt/argon2 (extra native dependency; scrypt is built into Node).

## R4. Origin, CSRF and login rate limit

- **Decision**:
  - Origin: every Teacher mutation (including login) and every Teacher Socket handshake requires an exact `Origin` in `TEACHER_ALLOWED_ORIGINS` (defaults to the same dev origins as Student: `http://127.0.0.1:5173`, `http://localhost:5173`; required in production).
  - CSRF: following the Student pattern, an HMAC token (`TEACHER_SESSION_SECRET`-derived key, separate purpose label) bound to the login session id, 8-hour lifetime, returned by `GET /api/v1/teacher/me` and sent as `X-CSRF-Token` on every Teacher mutation. Login is the sole bootstrap exception (no session yet); it still requires an exact Origin.
  - Login rate limit: at most **5 failed attempts per 15 minutes per client address**, then HTTP 429 `RATE_LIMITED` until the window passes; a successful login clears that address's counter. An overall cap of **50 failed attempts per 15 minutes** guards against address rotation. In-memory, single process.
- **Rationale**: Mirrors the reviewed Student design; 5 per 15 minutes is the common lockout default and does not bother a teacher who mistypes once or twice.
- **Alternatives rejected**: Reusing `STUDENT_CSRF_SECRET` (couples two features' keys); account lockout without time window (could lock the only teacher out during class).

## R5. Teacher HTTP ActorContext and Socket identity

- **Decision**:
  - HTTP: Teacher router middleware verifies the cookie and session row, then for `/teacher/sessions/:sessionId/...` checks the Session exists and builds `{ actorKind:'teacher', actorId:'teacher', sessionId, permissions:['session:read','session:watch','target:preview','target:read','results:read','round:end'] }` per request.
  - Socket: `resolveSocketActorContext(socket)` returns `null` if `handshake.auth.sessionId` is present (Student path; `app.ts` already fails closed there), checks the handshake `Origin` against `TEACHER_ALLOWED_ORIGINS`, verifies the cookie and session row, and returns a Teacher context **without** `sessionId` (permissions `['session:watch']`), registered in a Teacher-module `WeakSet`. `authorizeWatch(actor, sessionId)` requires WeakSet membership, `actorKind === 'teacher'`, `session:watch`, and an existing Session.
- **Rationale**: Exactly section 5.2 item 1. The resolver runs on every watch, so expiry and logout take effect on the next watch.

## R6. Live monitoring within 2 seconds

- **Decision**: The Teacher page polls a Teacher-only monitor endpoint every **1 second** while the current round is Active (and once after each state change). Phase changes still arrive through the existing Foundation `session:state:changed` event, which also triggers an immediate refetch.
- **Rationale**: No Student code change and no new Socket event. Worst case delay = 1 s interval + request time, within 2 s on a local network. Load is one small SQLite read per second for a single teacher.
- **Alternatives rejected**: A Teacher Socket event emitted from `SubmissionService` (needs a Student code change and a new event contract; coordination cost for a single-teacher demo).

## R7. Activity code and Teams

- **Decision**: 6-character code from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L), generated with `crypto.randomInt`, retried on the unique-constraint collision (max 10 tries). Session and Teams `第1組`…`第N組` are created in one immediate transaction; N is an integer 1–20.
- **Rationale**: Easy to read aloud and type; fits Foundation's normalization (upper-case, ≤64 chars).

## R8. Targets, "next" and reopen

- **Decision**: A target is a standalone Question (no group) or a QuestionGroup. Target order = import order, stored in `questions.position` / `question_groups.position` on one shared sequence. Status of a target = phase of its latest Round, or `NotOpened` when it has none. "Next" = first `NotOpened` target in order. Select and reopen both call `SessionLifecycleService.selectTarget(sessionId, target, expectedStateVersion)`; Foundation rejects selection while the current Round is Waiting or Active, and rejects empty groups. Teacher additionally rejects targets with zero Blanks before calling Foundation.
- **Rationale**: Reuses Foundation's lifecycle and conflict errors unchanged.

## R9. Ending a round

- **Decision**: Teacher calls `endCoordinator.endRound({ sessionId, roundId, expectedStateVersion, requestId }, teacherActor)` once; `requestId` is a server-generated UUID used only for tracing. 409 `STALE_STATE` or `INVALID_PHASE` are returned to the page, which refetches state (section 5.2 item 5).

## R10. Results, history and CSV

- **Decision**:
  - Teacher result for a round: all Submissions of that Round joined to Team and SubmissionAnswers, ordered by `accepted_order`; the winner is the Round's `results` row when present.
  - Rounds whose Result was replaced by a later reopen: winner = smallest `accepted_order` of an Ended round (the same rule the Student resolver uses). "第幾輪" = 1-based ordinal of the Round among Rounds of the same target, by `created_at`.
  - CSV: UTF-8 with BOM, CRLF line ends, RFC 4180 quoting. Columns `題號,第幾輪,組別,答案,順位,是否勝出,送出時間`. Answers joined as `（1）CPU；（2）OS`; a blank without a marker is written as its answer alone. Time is `YYYY-MM-DD HH:mm:ss` in `Asia/Taipei`. Cells starting with `=`, `+`, `-`, `@` are prefixed with `'` (spreadsheet formula injection).
- **Rationale**: BOM makes Excel and Google Sheets show Chinese correctly; injection guard matters because answers are student-typed.

## R11. Google Sheets access

- **Decision**:
  - Package `googleapis` with `google.auth.GoogleAuth({ keyFile, scopes:['https://www.googleapis.com/auth/spreadsheets'] })`. **Adding the dependency to `apps/server/package.json` needs coordination.**
  - `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` must resolve to a file **outside** the repository root; startup refuses a path inside the repo. The service-account email is read from the key file's `client_email` and shown on the import page. If unset, import and write-back return 503 `SHEETS_NOT_CONFIGURED`; P1 works without it.
  - All calls go through a `SheetsGateway` interface (`readSheet`, `readCells`, `writeCells`). Tests use an in-memory fake; real Google calls are manual tests only.
  - URL: host `docs.google.com`, path `/spreadsheets/d/{id}`; tab from `gid` in `#gid=` or `?gid=`, otherwise the first tab.
  - Read: `spreadsheets.get` (fields `sheets(properties(sheetId,title),merges)`) then `spreadsheets.values.get` with `FORMATTED_VALUE`.
  - Write: one `spreadsheets.batchUpdate` with `updateCells` requests (documented as atomic: all or nothing).
  - Error mapping: malformed URL → 400 `INVALID_SHEET_URL`; Google 403 → 403 `SHEET_NOT_SHARED`; Google 404 or unknown gid → 404 `SHEET_NOT_FOUND`; network or 5xx → 502 `SHEETS_UNAVAILABLE`.
- **Known limitation**: Sheets has no compare-and-set, so the re-check before writing leaves a window of about one request in which another editor could change a cell. This is documented and accepted for a classroom demo.

## R12. Guided Notes parser (pure function)

- **Decision**: `parseGuidedNotes({ sheetTitle, values, merges })` returns `{ targets, warnings }` or a typed error, with no I/O. Rules:
  1. Normalize text (trim, full-width to half-width spaces, NFKC for comparison only).
  2. Header row = first row containing cells whose normalized text is `題號` and `作答` (`題目` used when present; not required). Missing → `SHEET_FORMAT_INVALID`.
  3. The answer cell of a row is the top-left cell of the merge (if any) covering the `作答` column in that row.
  4. For each row below the header, the number = value of the top-left cell of the merge covering the `題號` column. Skip the row when that value is empty, or when one merge covers both the `題號` and `作答` columns (spacer rows such as `B6:H6`).
  5. Rows sharing one vertical `題號` merge form a group target; a row outside such a merge is a standalone question target.
  6. Number normalization: `1.0`, `1` → `1`; other text kept trimmed. Duplicate numbers → `DUPLICATE_QUESTION_NUMBER`.
  7. Blanks: markers matched by `/[（(]\s*(\d+)\s*[）)]/g` in the answer cell; 0 markers → one blank without a marker; k markers → k blanks of one question.
  8. No question rows → `SHEET_FORMAT_INVALID`.
- **Test data**: cell values and merges transcribed from both `docs/examples/` templates into test fixtures, plus variants: header moved to another row and column, extra columns, more questions, a cell with two markers, half-width markers, a missing header, duplicate numbers.

## R13. Write-back

- **Decision**:
  - Plan = every target with a current winner, plus every previously written blank whose target now has no winner (restore). Entries are per cell (a cell with several markers becomes one entry).
  - New content: start from the original content; insert each blank's answer right after its marker; a marker-less blank's cell becomes the answer.
  - Restore entries use the original content.
  - Expected current content = `last_written_content` if set, else `original_content`.
  - `POST …/write-back/preview` returns entries and a `planDigest` (SHA-256 of the entries). `POST …/write-back/confirm` with that digest recomputes the plan; if the digest differs (results changed) → 409 `STALE_STATE`. It then re-reads the cells; any mismatch or missing cell → 409 `SHEET_CONFLICT` listing the cells, nothing written. Otherwise one atomic batch write, then `last_written_content` is updated in SQLite.
- **Rationale**: Matches FR-033–FR-036 and the clarified all-or-nothing rule.

## R14. Frontend structure

- **Decision**: Replace the two Teacher placeholders and add one child route, all under `/teacher/`: `/teacher/login`, `/teacher/dashboard` (activity list, create), `/teacher/sessions/:sessionId` (control, monitor, results, import, write-back, export panels). **Editing `apps/web/src/app/router.tsx` needs coordination** (shared route table; additive change). Teacher Socket uses the existing `session-state-client.ts` without `auth.sessionId`. Answers on the monitor panel are hidden by default with a "顯示答案" toggle; the toggle is a page-only setting and is not persisted.

## R15. Contracts placement

- **Decision**: Teacher DTOs live in `packages/contracts/src/teacher.ts`, exported from `packages/contracts/src/index.ts` with one added line. **Needs coordination** (shared package; additive).

## R16. Configuration and secrets

- **Decision**: New variables `TEACHER_PASSWORD_HASH`, `TEACHER_SESSION_SECRET` (≥32 bytes), `TEACHER_ALLOWED_ORIGINS`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, parsed by a Teacher-owned config module (`apps/server/src/modules/teacher/config.ts`); `apps/server/src/config/env.ts` is not modified. Production refuses to start Teacher integration without the hash and secret; development without them starts the server but Teacher login returns 503 `TEACHER_NOT_CONFIGURED`. Add a root `.env.example` with placeholder values for all project variables. `.gitignore` already ignores `.env` and `.env.*` (except `.env.example`); no change needed.
