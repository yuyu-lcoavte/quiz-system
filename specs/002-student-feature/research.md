# Student Feature Research

**Date**: 2026-11-10  
**Scope**: Plan-stage decisions for the clarified Student Feature. These are technical proposals, not claims that the Teacher Feature member has reviewed every internal contract.

## Existing Foundation Baseline

- The single React app already owns `/student/join` and `/student/session/:sessionId`; the Student pages are placeholders.
- The Express server already mounts Foundation reads under `/api/v1/sessions`; `GET /sessions/by-code/:activityCode` is anonymous, minimal, validated and rate-limited. Protected reads use a server-supplied ActorContext.
- `actorContextMiddleware` only calls the trusted resolver injected by the host and fails closed when it returns null. It does not parse or authenticate Student cookies. Socket.IO has an analogous optional resolver.
- `SessionStateClient` already watches the Foundation state events, reconciles on reconnect, validates Session ID and ignores non-increasing `stateVersion`. It carries no answer drafts.
- SQLite migration `001-foundation.sql` owns Sessions, Teams, Participants, Submissions, SubmissionAnswers and Results. It enforces Team/Round uniqueness, integer and per-Round uniqueness for `accepted_order`, target-Blank and same-Session integrity, and Result-to-winning-Submission same-Round integrity. It has no credential, Team leader, membership recovery, draft or draft-lock records.
- `SubmissionRepository.create` persists an `acceptedOrder` supplied by its caller. That is the intended Student server responsibility boundary.
- `endRoundWithResult()` takes a preselected Result and transactionally updates Ended/stateVersion/Result. `SessionLifecycleService.endRound()` publishes after its own transaction returns. A winner query done before this call is not serialized against a later submission.
- Existing `ResultView` contains the Foundation Result (winning Submission ID) only. Student must build its own authorized projection from canonical persisted data.

The integration guide is accurate that Foundation does not provide formal Teacher/Student authentication or business mutations. Its phrase that Foundation “provides a server-generated ActorContext” should be read as the shared type and trusted-resolver middleware seam; actual credential verification and ActorContext construction belong to feature-owned authentication middleware.

## Decisions

### D1. Keep a single application and reuse the Foundation data model

**Decision**: Implement Student pages and services inside current workspaces. Continue to use canonical Foundation Team/Participant/Submission/SubmissionAnswer/Result rows. Use Foundation's current-target, state, result persistence and state-notification behavior.

**Rationale**: This follows Constitution modularity and FR-018 and avoids duplicate authority.

**Alternatives considered**: A second student app, Student copies of Team/Submission, or replacement Foundation read APIs. Rejected because each would create incompatibility or drift.

### D2. Opaque browser credential; server-side Session-to-Participant binding

**Decision**: After enrollment, issue a cryptographically random opaque browser credential in an HttpOnly cookie. Persist only its SHA-256 digest, creation/expiry/revocation state, and a server-side mapping from that browser credential plus Session to the canonical Participant. The cookie contains no Participant ID, Team ID or role. A browser credential may be associated with separate activity-scoped Participants across Sessions. Resolve identity only for the Session in the route and construct ActorContext server-side.

Use the Student-specific `student_session` cookie with `Path=/` so the same-origin browser sends it to both `/api/v1/student` and `/socket.io`. Keep it `HttpOnly`, `SameSite=Lax` for the existing same-origin flow, `Secure` on production HTTPS, with no `Domain`, bounded expiry and revocation. Only Student HTTP identity middleware and the Student Socket.IO handshake resolver parse it; its broader path grants no route or room permission. Verify the exact Origin on Socket.IO handshake and resolve Participant/Team from the server-side Session mapping. Do not store the credential in localStorage, expose it in response JSON, or log it. Reject expired/revoked or unmapped cookies with 401; show a recover/rejoin state rather than silently restoring by display name. Teacher may transfer an unrecoverable leader's role under the clarified rule. A session-bound HMAC CSRF token is returned by enrollment and can be refreshed by a non-caching identity-scoped token read; this supports multiple tabs without storing raw tokens or invalidating another tab's token. The HMAC signing key is required server configuration, not a source-controlled default.

Cookie-authenticated mutations require an exact configured Origin check and a session-bound synchronizer CSRF token sent in a custom header. The sole bootstrap exception is the first enrollment that creates a Participant binding for a Session: no Session-bound token exists before that request, so it is protected by strict exact-Origin validation, input/relationship validation and rate limiting; missing or disallowed Origin is rejected. Once bound, enrollment retries and all other protected mutations require the CSRF token. Socket.IO validates the browser Origin and requires the CSRF token on draft mutation events. Vite's existing `/api` and `/socket.io` proxies provide the local same-origin path. Any future cross-origin deployment must use an explicit credentialed-origin allowlist, never wildcard CORS.

**Rationale**: Opaque credentials keep identity server-verifiable and support same-browser recovery without a student account. Session mapping keeps Participant scope activity-specific.

**Alternatives considered**: Participant/Team IDs in the cookie, localStorage bearer tokens, or client-signed role claims. Rejected because they expose authority to the client. A cross-activity student account is out of scope.

**ActorContext integration**: Resolve Session scope from the matched protected HTTP route before mapping the cookie to Participant/Team. For Socket.IO, allow the handshake to name a `sessionId` scope selector; verify the cookie-to-Participant association for that Session and require all event scopes to match. The selector is a resource reference, not an identity or permission claim. Configure the existing server resolver seam to fail closed when the mapping is missing.

### D3. Atomic enrollment and first-leader election

**Decision**: In one `BEGIN IMMEDIATE` transaction, validate Session and an existing Team, insert or reuse the canonical Participant for this browser/Session, bind it to the browser credential, and insert the `team_leaders` row only if no leader exists. `team_id` primary key/unique constraints and SQLite writer serialization make the first committed member the only initial leader. Repeated join from the same credential and Session is idempotent. First-time enrollment remains allowed after the Session first enters Active, but only into an existing Team; Student never creates Teams. The rule remains available because no Teacher admission-stop setting or Session-closed state is being added.

A Student-requested pre-start team change must explicitly identify the current leader's successor, validate the successor is an existing member of the source Team, hand off the leader row and move the requester in one transaction. An existing Participant cannot change Teams after the first Active Round; a late first-time join is not a transfer. Student enrollment never creates a Team; initial leader election applies to an existing Team that has no leader yet. A Teacher transfer uses a separate trusted in-process service and the same database constraints. No disconnect timer changes leader state.

**Rationale**: Database serialization is the authority for concurrent joins, not request arrival time measured by clients.

**Alternatives considered**: Electing in React, “first request started” timestamps, or unconstrained boolean `isLeader`. Rejected because concurrent requests and client tampering can create multiple leaders.

### D4. Versioned persisted draft and Student-only realtime channel

**Decision**: Store one `team_round_drafts` row per Team/Round and one current value per Blank. Increment a monotonic draft version in each immediate transaction. Last server-accepted edit to a Blank wins; stale `baseVersion` is informational and does not replace the confirmed conflict policy. Commit the value/version before emitting `student:draft:changed`. ClientMutationId is used to make retries idempotent. Reconnect and refresh use the Student draft snapshot read; Socket events are notifications, not the source of truth.

Use server-computed room names scoped to Team and Round. Derive Team from ActorContext and recheck membership on watch and edit. Foundation state events remain reference-only and unchanged.

**Rationale**: A persisted version gives deterministic order, prevents older client updates from replacing newer server-accepted state, and enables reconnect recovery.

**Alternatives considered**: In-memory drafts, client timestamp order, or putting answer values in `session:state:changed`. Rejected because they lose recovery, trust client clocks, or violate Foundation's state contract.

### D5. Atomic Submission with server-generated acceptedOrder

**Decision**: A submission transaction rereads actor, membership, leader assignment, Session/current Round/phase, expected target Blank IDs and existing Team/Round submission; validates every required answer is non-whitespace; assigns `MAX(accepted_order)+1` for that Round under the immediate writer lock; writes the canonical Foundation Submission and answers; and locks the Team/Round draft before commit. Existing `UNIQUE(team_id, round_id)` and `UNIQUE(round_id, accepted_order)` remain final guards. Emit success/draft-lock notifications only after commit. Never accept `acceptedOrder` from the request.

**Rationale**: The shared SQLite write lock creates a single trusted sequence across concurrent valid submissions. Rollbacks do not create accepted Submissions or lock drafts.

**Alternatives considered**: Device timestamps, process-local counters, allocating order before the transaction, or writing Submission then locking draft later. Rejected because they are not authoritative across concurrency or can leave an editable successful Submission.

### D6. Resolve winner inside Foundation's End transaction

**Decision**: Teacher calls exactly one synchronous Student-owned in-process `StudentTrustedEndCoordinator.endRound(input, actorContext)` interface. It verifies a Teacher ActorContext with the proposed `round:end` capability and delegates to Foundation lifecycle through an injected synchronous port. Foundation's internal lifecycle method accepts a synchronous generic `() => Result | null` resolver callback while holding `BEGIN IMMEDIATE`; Student's callback selects the smallest persisted `accepted_order` for the current Round (or returns no winner). The resolver and all SQLite work in the transaction return synchronously; no Promise is returned or awaited. Foundation validates the current Round/version, persists Ended/stateVersion and the supplied Result/replacement atomically, and commits before returning. Only after Commit does it dispatch the existing Socket.IO state notification asynchronously; a notification is never awaited inside the transaction. Teacher never calls Foundation and the resolver separately.

The existing external HTTP routes, DTOs, `session:state:changed` and other Foundation Socket event names remain unchanged. The current `endRoundWithResult()` accepts a static Result before opening its transaction, so simply calling a Student query and then the existing high-level `endRound()` is unsafe. The resolver seam is an internal compatibility change that must be reviewed with the Teacher/Foundation integration owners before implementation. The root composition injects the same `better-sqlite3` Database instance into Foundation lifecycle, Student coordinator and winner resolver. The callback is synchronous and uses that same connection; neither module opens another connection, returns a Promise, or awaits inside the transaction. Foundation imports only a generic resolver shape using the canonical Result type; Student depends on that port and implements the callback. The Teacher calls only the Student coordinator, avoiding a Foundation↔Student import cycle.

**Rationale**: Submit and End are serialized by the same SQLite writer lock. If Submit commits first, End sees it. If End obtains the lock first, it commits Ended before any later Submit can pass the Active check. The state event and result are published only after the outermost transaction commits.

**Alternatives considered**: Separate winner HTTP query followed by End, Teacher front-end winner choice, or a new public Foundation result event. Rejected because the first has a TOCTOU race, the second is untrusted, and the third changes shared contracts unnecessarily.

### D7. Student result projection and Foundation reads

**Decision**: Add a Student-authenticated result projection that is available only after Foundation reports the requested current Round as Ended. Join the persisted Foundation Result, Submission, Team and SubmissionAnswers/Blank rows. Return only the winner Team name and successful answers, or an explicit no-winner projection. Reuse Foundation current-target only while Active; never place Question content or answers in Foundation state snapshots.

**Alternatives considered**: Expand Foundation `ResultView`, return all team submissions, or let the client infer the winner. Rejected because the required Student view is narrower and the user specified no Foundation external contract change.

### D8. Additive Student HTTP and Socket.IO contracts

**Decision**: Define Student-owned contracts under `/api/v1/student` and separate `student:draft:*` Socket events/types. All responses use the existing success/error envelope. Add type exports under the shared `@quiz/contracts` package's Student subpath; leave Foundation type definitions and events intact. Public join-options reads expose only Session phase and Team IDs/names, validate the Activity Code through Foundation's existing query service, and use configurable rate limiting.

**Alternatives considered**: Modify Foundation `GET /sessions/by-code` to expose Teams, or reuse Foundation state events for draft data. Rejected because they modify a shared public contract or leak answer data into a state-only event.

## Compatibility Findings and Open Review Items

1. **No Foundation public-contract conflict**: Student HTTP paths, Student DTOs and draft Socket events are additive. Existing Foundation contracts remain unmodified.
2. **Required internal Foundation seam**: Winner selection must run inside Foundation's End transaction. Existing code does not currently expose that callback. This is not a public API change, but is a material implementation dependency and needs Teacher/Foundation owner review before the affected implementation task starts.
3. **Single Teacher call**: The proposed `StudentTrustedEndCoordinator.endRound(...)` accepts Teacher context and owns delegation to the Foundation callback. Teacher/Student/Foundation owners must review the exact interface and same-connection callback before implementation.
4. **Capability names**: Foundation currently lists only `session:read`, `session:watch`, `target:preview`, `target:read`, and `results:read`. Student proposes the new strings `team:leader:transfer` and `round:end` in the existing string-valued permission array. These are not current Foundation permissions; Teacher middleware must issue them only after successful Teacher authentication and authorization. Names are proposed for cross-feature review, not claimed as existing or code-verified.
5. **Late enrollment**: First-time enrollment after first Active into an existing Team is now explicit in the Spec. There is no new Team-creation or admission-stop API.
6. **ActorContext wording in the handoff**: Actual Foundation code supplies a resolver seam, not production cookie authentication. Student owns the cookie resolver; Teacher owns Teacher authentication.

## References

- `specs/002-student-feature/spec.md` and `checklists/requirements.md`
- `specs/001-shared-foundation/{spec.md,plan.md,data-model.md,contracts/}`
- `docs/integration/teacher-foundation-integration-guide.md`
- `docs/integration/student-teacher-decisions.md`
- `apps/server/src/api/middleware/actor-context.ts`
- `apps/server/src/modules/sessions/application/{session-lifecycle-service.ts,foundation-transactions.ts}`
- `apps/server/src/persistence/migrations/001-foundation.sql`
- `apps/web/src/services/session-state-client.ts`
