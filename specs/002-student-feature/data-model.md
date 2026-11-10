# Student Feature Data Model

This design extends the existing Foundation SQLite schema additively. Foundation Team, Participant, Submission, SubmissionAnswer and Result rows remain the canonical domain records. Student tables hold only browser credential state, the current leader assignment and draft state.

## Reused Foundation Entities

| Entity | Existing authority and Student use |
|---|---|
| `Session` | Existing `sessions` row; Activity Code lookup, phase, current Round and state version. |
| `Team` | Existing `teams` row and Session relation; source for team display names and Participant membership. |
| `Participant` | Existing `participants` row; inserted by Student enrollment, linked to one canonical Team. Its `display_name` is the Student-entered display name. |
| `Round` | Existing `rounds` row; each draft/submission is scoped to its exact ID, so reopening creates a separate work scope. |
| `Question`, `QuestionGroup`, `Blank` | Existing target hierarchy; Student uses Foundation current-target reads and validates every submitted/drafted Blank against the current Round target. |
| `Submission`, `SubmissionAnswer` | Existing canonical answer record. Student writes them atomically with the server-assigned `acceptedOrder`. |
| `Result` | Existing Foundation result row; Student winner selection supplies a winning Submission, and Foundation persists/replaces the Result. |
| `ActorContext` | Existing shared type; Student's trusted cookie resolver supplies actor, Session, Team and capabilities on each protected request/connection. It is derived data, not a new persisted authority. |

## Student-Owned Entities

### `StudentBrowserCredential`

An opaque browser credential stored as a one-way digest; it contains no Participant ID or role.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; internal credential row identifier. |
| `tokenHash` | fixed-length digest | Unique; digest of a cryptographically random bearer token; never the raw cookie value. |
| `createdAt` | ISO datetime | Server UTC time. |
| `expiresAt` | ISO datetime | Server-enforced expiry. |
| `revokedAt` | ISO datetime or null | Non-null credentials cannot authenticate. |
| `lastSeenAt` | ISO datetime | Updated on successful identity restoration, with bounded write frequency. |

**Relationships**: One credential can be associated with at most one Participant per Session. A Participant is activity-scoped through its Team's Session. The browser cookie maps to the credential; a route Session ID selects the associated Participant server-side.

The synchronizer CSRF token is stateless: the server signs a short-lived token bound to credential ID and Session with a server-held HMAC key. Only the signing key is configured; neither the raw token nor a token digest is stored in SQLite. A read-only token refresh is `Cache-Control: no-store` and does not rotate another browser tab's token.

The browser cookie is Student-specific (`student_session`), `HttpOnly`, `SameSite=Lax`, and uses `Path=/` so the browser sends it to both the Student HTTP base path and same-origin `/socket.io`. `Secure` is required over production HTTPS. Only Student HTTP identity middleware and the Student Socket.IO handshake resolver read it; it is not a generic authorization grant. Socket.IO validates exact Origin and derives Participant/Team from the server-side Session mapping. State-changing requests/events validate Origin and the session-bound CSRF token, except the initial enrollment bootstrap for a Session that has no Participant binding/token yet; that request still requires an exact allowed Origin and full server-side validation. Once bound, enrollment retries and all other mutations require the token.

### `StudentBrowserParticipant`

The association between a browser credential and one canonical Participant within one Session.

| Field | Type | Rules |
|---|---|---|
| `credentialId` | UUID | Foreign key to `student_browser_credentials`. |
| `sessionId` | UUID | Foreign key to canonical `sessions`. |
| `participantId` | UUID | Foreign key to canonical `participants`; exactly one mapping per credential and Session. |
| `createdAt` | ISO datetime | Server UTC time. |

**Keys/constraints**: Primary key `(credentialId, sessionId)`; unique `(sessionId, participantId)`. A trigger/domain check verifies that the Participant's Team belongs to `sessionId`. This mapping does not duplicate membership or Team authority.

### `TeamLeader`

The current single authorized submitter for a canonical Team.

| Field | Type | Rules |
|---|---|---|
| `teamId` | UUID | Primary key and foreign key to canonical `teams`; guarantees at most one leader per Team. |
| `participantId` | UUID | Unique foreign key to canonical `participants`; must be a member of `teamId`. |
| `assignedAt` | ISO datetime | Server UTC time of the current assignment. |
| `assignedByKind` | `participant | teacher | system` | Server-derived source for current assignment; not accepted from a browser. |
| `assignedById` | string or null | Trusted actor ID for transfer; no credential material. |

**Relationship**: Each Team has zero or one current leader until its first successful member joins; after that it has exactly one active leader unless the service reports an integrity error. A database unique key on `teamId` and a transactional membership check enforce the rule. History/audit events are outside this Feature unless required by a later review.

### `TeamRoundDraft`

One shared answer draft per Team and exact Round.

| Field | Type | Rules |
|---|---|---|
| `sessionId` | UUID | Supports same-Session composite integrity checks. |
| `teamId` | UUID | Canonical Team; part of primary key. |
| `roundId` | UUID | Canonical Round; part of primary key. |
| `version` | non-negative integer | Increments once per accepted edit transaction. |
| `status` | `editable | locked` | Starts editable; becomes locked atomically with successful Submission. |
| `createdAt` | ISO datetime | Server UTC time. |
| `updatedAt` | ISO datetime | Server UTC time of latest accepted edit/lock. |
| `lockedAt` | ISO datetime or null | Set on successful Submission. |

**Keys/constraints**: Primary key `(teamId, roundId)`. Composite foreign keys `(sessionId, teamId)` and `(sessionId, roundId)` reference the canonical Team and Round pairs. All writes check the current Round/Session and membership in the transaction.

### `TeamRoundDraftAnswer`

The most recently server-accepted value for an individual Blank in a Team/Round draft.

| Field | Type | Rules |
|---|---|---|
| `teamId`, `roundId` | UUID pair | Foreign key to `TeamRoundDraft`. |
| `blankId` | UUID | Foreign key to canonical `blanks`; must belong to the Round's Question or QuestionGroup target. |
| `value` | string | Current draft value; may be blank while editing. |
| `revision` | positive integer | Draft version at which this value was last accepted. |
| `updatedByParticipantId` | UUID | Server-derived actor for audit/display; never supplied as authority. |
| `updatedAt` | ISO datetime | Server UTC time. |

**Keys/constraints**: Primary key `(teamId, roundId, blankId)`. A trigger plus domain validation verifies target membership. Last accepted transaction wins even when the client based its edit on an older version.

## Additive Migration Design

The next migration (planned name `002-student-feature.sql`) creates only Student-owned tables and indexes. It does not replace Foundation's `participants`, `submissions`, `submission_answers`, `results`, or existing constraints.

- Add a unique parent index on `(participants.team_id, participants.id)` if needed for composite membership validation.
- Create credential and credential-to-Participant association tables with foreign keys, uniqueness, expiry/revocation fields and no raw secrets.
- Create `team_leaders` with one row per Team and a trigger/domain constraint ensuring its Participant is on that Team.
- Create `team_round_drafts` with composite Session/Team/Round foreign keys and checks for version/status/lock consistency.
- Create `team_round_draft_answers` with one current value per target Blank; triggers ensure the Blank belongs to the Round's valid Question or QuestionGroup and reject insert/update/delete when the parent draft is locked.
- Add a database guard preventing a TeamRoundDraft from returning from `locked` to `editable`; the application transaction remains responsible for setting the lock with Submission.
- Use Foundation's existing Submission unique constraints and target validation for accepted answer rows. Do not add a second accepted-order table or local counter table.
- Keep the existing migration runner and enable Foreign Keys on every connection as Foundation already does.

## State and Transaction Rules

### Enrollment and initial leader

`BEGIN IMMEDIATE`: resolve canonical Session and selected pre-existing Team; resolve/create a valid browser credential; create the canonical Participant and Session association; insert TeamLeader only if the Team has none; return current membership and leadership. This first-time join is allowed before and after the Session first enters Active; it never creates a Team. A repeated request from the same credential/Session returns the existing Participant. A different first-member request serializes behind the writer lock; database uniqueness prevents two leaders.

### Team change and leader handoff

`BEGIN IMMEDIATE`: resolve requester from ActorContext; verify source membership and that no Round in the Session has ever entered Active; if requester is leader, require a valid existing source-Team successor and update TeamLeader before moving membership; update canonical Participant's `team_id`; if the destination Team has no leader, assign the requester; update credential association; commit. Any failed validation rolls back the entire change. A new Participant may still first join an existing Team after first Active; that is enrollment, not transfer. Teacher recovery transfer invokes the separate trusted service and uses the same membership/unique constraints.

### Draft edit

`BEGIN IMMEDIATE`: verify actor membership, Session/current Round identity, Active phase, target Blank membership and editable draft; create the draft if absent; upsert one Blank value; increment draft `version`; set answer `revision` to the new version; commit; then emit the new version to the server-derived Team/Round room. A duplicate `clientMutationId` returns the original accepted result without incrementing twice.

### Submission

`BEGIN IMMEDIATE`: resolve actor and Team from trusted context; verify current leader; reload Session/current Round and Active phase; derive expected Blank set from canonical current target; require exactly one non-whitespace answer for every answerable Blank (a zero-Blank target is not submittable); verify values and same-Session links; reject any existing Team/Round Submission; assign `MAX(accepted_order)+1` while holding the SQLite writer lock; insert canonical Submission and SubmissionAnswers; set TeamRoundDraft to locked; commit. Foundation uniqueness remains a final guard. Notify clients only after commit.

### End and winner

Foundation's internal lifecycle transaction takes `BEGIN IMMEDIATE`, verifies the current Active Round and expected `stateVersion`, invokes a synchronous Student winner resolver against the same database connection/transaction, writes Ended/stateVersion and the supplied Result (or removes the old logical-target Result when there is no winner), and commits. The existing Foundation state publisher runs after the outer transaction returns. Because Submit uses the same writer serialization, an accepted Submit is either fully committed before winner selection or rejected after Ended; it cannot slip between selection and End.

### Result projection

After Ended, verify the Student belongs to the same Session and query only the Foundation Result's winning Submission, Team name and answer rows. Do not return other submissions, acceptedOrder, or losing Team data. A no-winner End returns an explicit projection with `winner: null`.

## Validation Rules

1. Every Student actor is derived from a valid, unexpired, non-revoked browser credential plus the requested Session's server-side Participant association.
2. Participant membership is determined from canonical `participants.team_id` and canonical Team/Session relations.
3. A Team's current leader is stored once and must be a member of that Team.
4. Drafts are isolated by `(teamId, roundId)` and values by Blank; Question/QuestionGroup counts remain dynamic.
5. Draft and Submission Blank IDs must belong to the current Round target; no client-supplied target/Team can widen access. Database triggers protect draft-target membership and post-submit read-only state; domain validation supplies dynamic complete-Blank checks.
6. A successful Submission is unique per Team/Round, has all required non-whitespace values, a server-generated per-Round accepted order, and a locked draft in the same commit.
7. Results are read only when Ended and only through the Student projection; Foundation Result remains authoritative.
8. Reopened logical targets use a new Round ID; no old Round draft can be read as the new Round draft.
