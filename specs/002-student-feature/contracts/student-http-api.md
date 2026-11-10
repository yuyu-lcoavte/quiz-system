# Student HTTP Contract (Plan Proposal)

Base path: `/api/v1/student`. All success/error bodies use the existing Foundation envelope: `{ data: T }` / `{ error: { code, message, details? }, meta? }`. These routes are Student-owned additions and do not change Foundation's `/api/v1/sessions` routes or DTOs. The names and DTOs are Plan proposals for Teacher Feature review where an internal service is involved.

## Identity and Join

### Existing Foundation lookup

The join page first calls the unchanged `GET /api/v1/sessions/by-code/{activityCode}`. It remains the anonymous limited summary and grants no Participant permission.

### `GET /api/v1/student/join-options/{activityCode}`

Restricted anonymous read used after code lookup. It resolves the code through the Foundation `SessionQueryService`, applies the same configurable source/code throttling, and returns only the Session phase plus selectable IDs/names of Teams that already exist. It creates no identity and does not expose membership, Question, Blank, Submission or Result data. First-time enrollment remains available after the Session first enters Active; this endpoint does not create Teams or admit an existing Participant to another Team.

```json
{ "data": {
  "sessionId": "<uuid>",
  "phase": "Waiting",
  "teams": [{ "teamId": "<uuid>", "name": "Team A" }]
} }
```

Invalid codes use the common `SESSION_NOT_FOUND`/input errors; limit excess is `429 RATE_LIMITED`.

### `POST /api/v1/student/sessions/{sessionId}/enrollments`

Creates or idempotently restores this browser's Participant membership in the selected existing Team. First-time enrollment is allowed before and after the Session first enters Active; an existing Participant cannot use this route to change Team after that transition. Student enrollment never creates Teams. **CSRF bootstrap rule**: the first enrollment that creates this credential's Participant binding for the requested Session is the only Student HTTP bootstrap exception, because the Session-bound CSRF token is issued only after that binding exists. This request MUST pass exact configured `Origin` allowlist validation; missing, `null`, malformed or disallowed Origin is rejected. It is also rate-limited by source and Session and performs normal server-side input, Session, Team and membership validation. It does not trust client-supplied Participant, Team membership or role claims. An idempotent enrollment request for a Participant already bound to this Session is not a bootstrap and MUST include the normal valid session-bound `X-CSRF-Token` as well as a valid Origin. No other protected operation is exempt from CSRF validation. Body:

```json
{ "teamId": "<uuid>", "displayName": "Student name" }
```

Team ID is a selection request, not an authorization claim; the server verifies it belongs to the Session. The server creates/uses a canonical Foundation Participant and elects a leader transactionally. On first successful enrollment, response sets the opaque credential cookie and returns a current membership view plus a synchronizer CSRF token:

```json
{ "data": {
  "sessionId": "<uuid>", "participantId": "<uuid>",
  "team": { "teamId": "<uuid>", "name": "Team A" },
  "isLeader": true, "csrfToken": "<short-lived-token>"
} }
```

The response does not return the bearer cookie value. A repeated request with the same valid browser credential/Session returns the existing Participant; it does not create a second member or leader. If the credential is already bound to this Session, the repeat requires a valid session-bound `X-CSRF-Token`; the client may first obtain/refresh that token through the protected no-store CSRF-token read.

### Credential cookie and recovery

- Cookie name: `student_session`; value is a high-entropy opaque random secret.
- Store only SHA-256 digest and lifecycle metadata server-side. The cookie does not encode Participant, Team or permission data.
- Attributes: `HttpOnly`, `SameSite=Lax` for the existing same-origin Vite/API/Socket.IO flow, `Path=/`, `Secure` in production HTTPS, and no `Domain`; local HTTP development omits `Secure` only under explicit development configuration. The Student-specific `student_session` cookie is parsed only by Student HTTP identity middleware and the Student Socket.IO handshake resolver; the broad Path does not grant authorization to other routes.
- Proposed default absolute lifetime: 24 hours, configurable by server environment. Revoked/expired/missing association returns 401; the UI offers rejoin/recovery and never restores by display name.
- `GET /api/v1/student/sessions/{sessionId}/me` resolves the cookie's server-side Session-to-Participant association and returns current Team/leader status. It does not mutate identity or membership.
- `GET /api/v1/student/sessions/{sessionId}/csrf-token` resolves the same protected identity and returns a short-lived HMAC-signed CSRF token bound to credential and Session. Response uses `Cache-Control: no-store`; tokens already held in other tabs remain valid until their own expiry.
- Browser credential and CSRF values are excluded from logs and analytics.

### `POST /api/v1/student/sessions/{sessionId}/team-change`

Allows a Student to change Team before the first Round becomes Active. Cookie identity and CSRF header are required. Body:

```json
{ "targetTeamId": "<uuid>", "successorParticipantId": "<uuid-or-null>" }
```

If requester is the source Team leader, `successorParticipantId` must identify an existing source-Team Participant and explicit handoff is required. Non-leaders use `null`. In one transaction, the server validates Session/phase and membership, transfers leadership if needed, updates the canonical Participant's Team and associates it to the target Team. If the target has no leader, the first successful member becomes its leader. A teacher-only recovery transfer is not exposed through this Student route; it uses the internal service contract.

## Draft and Submission

All routes below require verified Participant ActorContext with matching Session/Team membership. Every state-changing HTTP request requires exact configured `Origin` allowlist validation and `X-CSRF-Token`; the server verifies its HMAC signature, credential ID, Session scope and expiry using `STUDENT_CSRF_SECRET`. The signing key is server configuration and is never sent to a client. The only exception is the first enrollment bootstrap defined above; it remains Origin-validated and does not grant any other request an exemption. Socket.IO handshakes also validate the exact browser Origin; the server obtains the `student_session` cookie from the browser handshake, resolves Participant/Team from the database, and rejects missing or unauthorized identity. Every state-changing draft socket event requires the session-bound CSRF token.

### `GET /api/v1/student/sessions/{sessionId}/rounds/{roundId}/draft`

Allowed to a member of the Team during Active. Creates an empty draft if none exists and returns the current full snapshot:

```json
{ "data": {
  "roundId": "<uuid>", "version": 4, "status": "editable",
  "answers": [{ "blankId": "<uuid>", "value": "draft", "revision": 4 }]
} }
```

The server checks that `roundId` is the Session's current Active Round. It returns only the caller's Team draft.

### `PUT /api/v1/student/sessions/{sessionId}/rounds/{roundId}/draft/answers/{blankId}`

Upserts a single current Blank value. Body:

```json
{ "value": "answer text", "baseVersion": 3, "clientMutationId": "<uuid>" }
```

`baseVersion` helps identify stale UI state but does not reject a valid stale edit; the last server-accepted edit wins. Replayed `clientMutationId` returns its original result. Success returns the committed draft version and accepted value. A blank value is allowed during editing; submission validation rejects non-answer values. The Blank must belong to the current target.

### `POST /api/v1/student/sessions/{sessionId}/rounds/{roundId}/submissions`

Only the verified current Team leader may submit. Body:

```json
{ "answers": [{ "blankId": "<uuid>", "value": "answer text" }] }
```

No `teamId`, `participantId`, `isLeader`, `acceptedOrder`, `submissionId` or client timestamp is accepted as authority. Server derives identity and Team, validates Active/current target and exact required Blank coverage, assigns the next `acceptedOrder` inside its immediate transaction, inserts canonical Foundation Submission/SubmissionAnswers and locks the Team/Round draft atomically.

The persisted Team/Round draft is the answer authority. The existing request `answers` is a confirmation of what the submitting leader saw: it must exactly match the complete persisted draft, otherwise return `409 STALE_STATE`. Values written to SubmissionAnswer are loaded from that draft inside the same transaction, never copied from request JSON. No automatic grading is performed. Locking increments the draft version so reconnect snapshots and `student:draft:locked` remain monotonic.

Success returns the accepted submission ID and `acceptedOrder` for the submitting Team only, plus draft status `locked`. The result is not a winner announcement. A later same-Team/Round submission returns `409 DUPLICATE_SUBMISSION`.

## Student Result Projection

### `GET /api/v1/student/sessions/{sessionId}/rounds/{roundId}/result`

Requires an enrolled Participant for the Session and an Ended current Round. Response contains only winner information:

```json
{ "data": {
  "roundId": "<uuid>",
  "winner": {
    "teamId": "<uuid>", "teamName": "Team A",
    "answers": [{ "blankId": "<uuid>", "label": "(1)", "value": "answer" }]
  }
} }
```

When no valid Submission won, response is `{ "data": { "roundId": "<uuid>", "winner": null } }`. The projection never returns other Team submissions, losing answers, acceptedOrder, Participant credential data or a Foundation `ResultView` extension. Before Ended, return `403 FORBIDDEN` without winner data.

## Error Mapping

Reuse the common envelope and stable Foundation codes where semantics match:

| HTTP | Codes | Examples |
|---|---|---|
| 400 | `INVALID_INPUT`, `INVALID_ACTIVITY_CODE` | Invalid UUID, malformed answer, invalid team selection. |
| 401 | `UNAUTHENTICATED` | Missing, expired, revoked or unmapped credential. |
| 403 | `FORBIDDEN` | Non-member, non-leader submit, forbidden phase, failed Origin/CSRF. |
| 404 | `SESSION_NOT_FOUND`, `TARGET_NOT_FOUND` | Unknown Session, Team, Round or Blank. |
| 409 | `INVALID_PHASE`, `DUPLICATE_SUBMISSION`, `STALE_STATE` | No longer Active/current, already submitted, conflicting membership transition. |
| 429 | `RATE_LIMITED` | Join-options/enrollment throttling. |
| 500 | `INTERNAL_ERROR` | Unexpected errors; details stay server-side. |

Student-only codes may be added as string codes in the common envelope without changing the Foundation error envelope structure. Do not put tokens, submitted answers from other teams or raw database exceptions in `details`.
