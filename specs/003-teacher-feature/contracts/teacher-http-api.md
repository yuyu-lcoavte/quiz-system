# Teacher HTTP Contract

Base path `/api/v1/teacher`, mounted through the reserved `createTeacherRouter(services)` hook. JSON in and out except the CSV export. Success and error envelopes follow the [Foundation HTTP contract](../../001-shared-foundation/contracts/http-api.md) (`{ data }` / `{ error: { code, message, details? } }`). DTO types live in `packages/contracts/src/teacher.ts`.

## Security applied to every route

| Check | Applies to | Failure |
|---|---|---|
| Exact `Origin` in `TEACHER_ALLOWED_ORIGINS` | every non-GET route, including login | 403 `FORBIDDEN` |
| Valid `teacher_session` cookie (HMAC signature + live session row) | every route except `POST /auth/login` | 401 `UNAUTHENTICATED` |
| `X-CSRF-Token` bound to the login session | every non-GET route except `POST /auth/login` | 403 `FORBIDDEN` |
| Session exists; per-request Teacher `ActorContext` built for it | every `/sessions/:sessionId/...` route | 400 `INVALID_INPUT` (not a UUID), 404 `SESSION_NOT_FOUND` |

Teacher identity is never produced for paths outside `/api/v1/teacher`. Client-sent role, team, session or permission fields are ignored. Secrets, hashes and key content never appear in responses or logs.

## Auth

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /auth/login` | `{ password }` | 204; sets `teacher_session` cookie (HttpOnly, SameSite=Strict, Path=/, Max-Age 28800, Secure in production) | 400 `INVALID_INPUT`, 401 `INVALID_CREDENTIALS` (same message for any failure), 429 `RATE_LIMITED` (5 failures / 15 min / address; 50 / 15 min overall), 503 `TEACHER_NOT_CONFIGURED` |
| `POST /auth/logout` | – | 204; revokes this device's session row and clears the cookie | 401, 403 |
| `GET /me` | – | `{ data: { authenticated: true, csrfToken, expiresAt, serviceAccountEmail: string \| null } }`; `Cache-Control: no-store` | 401 |

## Activities

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /sessions` | – | `{ data: ActivitySummary[] }` — `{ sessionId, activityCode, createdAt, teamCount, phase, imported }`, newest first | 401 |
| `POST /sessions` | `{ teamCount }` (integer 1–20) | 201 `{ data: ActivitySummary }`; Teams `第1組`…`第N組` created in the same transaction | 400 `INVALID_INPUT` |
| `GET /sessions/:sessionId` | – | `{ data: TeacherSessionView }` — `{ sessionId, activityCode, state: SessionStateSnapshot, teams[], targets: TargetStatusView[], source: { spreadsheetUrl, sheetTitle, importedAt } \| null }` | 404 |

`TargetStatusView` = `{ target: RoundTargetReference, number, kind:'question'|'questionGroup', questionCount, blankCount, status:'NotOpened'|'Waiting'|'Active'|'Ended', roundCount, hasResult }`, ordered by target position.

## Round control

All commands carry `expectedStateVersion` (from the latest snapshot) and return `{ data: SessionStateSnapshot }` after commit. Foundation publishes `session:state:changed` to the Session room.

| Method and path | Body | Behaviour | Errors |
|---|---|---|---|
| `POST /sessions/:sessionId/rounds/select` | `{ target, expectedStateVersion }` | New Waiting Round for a NotOpened target, or reopen of an Ended target | 400 `INVALID_INPUT`, 404 `TARGET_NOT_FOUND`, 409 `INVALID_PHASE` (current Round Waiting/Active), 409 `STALE_STATE`, 422 `TARGET_NOT_ANSWERABLE` (a Question with no Blank) |
| `POST /sessions/:sessionId/rounds/next` | `{ expectedStateVersion }` | Selects the first NotOpened target by position | 409 `NO_NEXT_TARGET`, 409 `NO_QUESTIONS`, plus select errors |
| `POST /sessions/:sessionId/rounds/start` | `{ expectedStateVersion }` | `sessionLifecycle.startRound` | 409 `INVALID_PHASE`, 409 `STALE_STATE` |
| `POST /sessions/:sessionId/rounds/end` | `{ expectedStateVersion }` | One call to `endCoordinator.endRound({ sessionId, roundId: currentRoundId, expectedStateVersion, requestId }, teacherActor)`; `requestId` server-generated | 409 `INVALID_PHASE`, 409 `STALE_STATE`, 404, 500 (resolver/DB failure; nothing committed, nothing published) |

The page refetches `GET /sessions/:sessionId` on any 409.

## Monitor and results

| Method and path | Success |
|---|---|
| `GET /sessions/:sessionId/monitor` | `{ data: { roundId \| null, phase, teams: [{ teamId, teamName, submitted, acceptedOrder \| null, receivedAt \| null, answers: [{ blankId, label, value }] }] } }` for the current Round. Never includes drafts. Polled every 1 s while Active. |
| `GET /sessions/:sessionId/results?roundId=` | `{ data: { roundId, target, number, roundNumber, submissions: [...ordered by acceptedOrder], winner: { teamId, teamName, answers[] } \| null } }`. Defaults to the current Round; any Round of this Session allowed. 409 `INVALID_PHASE` if that Round is not Ended. |

These responses exist only under `/api/v1/teacher` and require a Teacher cookie; Students cannot reach them.

## Guided Notes import (P2)

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /sessions/:sessionId/import/preview` | `{ url }` | `{ data: { spreadsheetId, sheetId, sheetTitle, questionNumberCount, targets: [{ number, kind, questions: [{ row, blanks: [{ cellA1, marker, originalContent }] }] }], warnings[], previewDigest } }` — nothing saved | 400 `INVALID_SHEET_URL`, 403 `SHEET_NOT_SHARED`, 404 `SHEET_NOT_FOUND`, 422 `SHEET_FORMAT_INVALID`, 422 `DUPLICATE_QUESTION_NUMBER`, 502 `SHEETS_UNAVAILABLE`, 503 `SHEETS_NOT_CONFIGURED` |
| `POST /sessions/:sessionId/import/confirm` | `{ url, previewDigest }` | 201 `{ data: TeacherSessionView }` | preview errors, 409 `IMPORT_LOCKED` (Session already has a Round), 409 `PREVIEW_CHANGED` (sheet changed since preview) |

Error `details` may include `{ row, column, cellA1 }` to point at the problem; never sheet contents beyond the cell in question.

## Write-back (P3)

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /sessions/:sessionId/write-back/preview` | – | `{ data: { entries: [{ cellA1, currentContent, newContent, kind:'write'\|'restore', number }], planDigest } }` covering all targets with a winner plus restore entries | 409 `NOTHING_TO_WRITE`, 409 `NOT_IMPORTED`, Sheets errors as above |
| `POST /sessions/:sessionId/write-back/confirm` | `{ planDigest }` | `{ data: { written: number } }` | 409 `STALE_STATE` (results changed since preview), 409 `SHEET_CONFLICT` with `details.cells: [{ cellA1, expected, actual \| null }]` — nothing written, Sheets errors |

## Export (P4)

| Method and path | Success |
|---|---|
| `GET /sessions/:sessionId/export.csv` | `200 text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="activity-<code>.csv"`. UTF-8 BOM, CRLF, RFC 4180 quoting. Header `題號,第幾輪,組別,答案,順位,是否勝出,送出時間`; one row per Round × Team; answers like `（1）CPU；（2）OS`; time `YYYY-MM-DD HH:mm:ss` (Asia/Taipei); `是否勝出` is `是` / `否`; cells starting with `=`, `+`, `-`, `@` prefixed with `'`. |

## Contract tests

- Every route: missing cookie → 401; tampered, expired or revoked cookie → 401; mutation without or with wrong CSRF → 403; disallowed or missing Origin on mutation → 403.
- Shared `/api/v1/sessions/:id/current-target` with only a Teacher cookie → 401 (no Teacher identity on shared paths).
- Login: wrong password → 401; sixth failure in 15 min → 429; success resets the counter.
- Round control: wrong phase → 409 `INVALID_PHASE`; old version → 409 `STALE_STATE`; empty group or zero-blank target rejected; next with none left → 409 `NO_NEXT_TARGET`.
- End: client-supplied winner fields ignored; Submit-vs-End both orders give a consistent Result.
- Monitor: no draft data; Student credentials get 401.
- Import, write-back and export cases listed in [quickstart.md](../quickstart.md) with the fake gateway.
