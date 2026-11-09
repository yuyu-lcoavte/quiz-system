# HTTP API Contract (Foundation)

Base path: `/api/v1`. Payloads and responses use JSON. Teacher and Student Features establish and verify their identities and own business mutations; the shared backend enforces common phase-based read access and lifecycle transaction rules.

**Contract ownership and handoff**: The Shared Foundation owner defines this version for Teacher/Student integration and will provide it to the Teacher Feature member. This records ownership and handoff responsibility; it does not claim that the other member has reviewed every contract item. Changes crossing module boundaries must be coordinated before adoption.

## Shared read contracts

| Method and path | Responsibility | Success response |
|---|---|---|
| `GET /sessions/by-code/{activityCode}` | Restricted anonymous, read-only pre-join lookup; does not establish membership. | `{ data: { sessionId, phase } }` |
| `GET /sessions/{sessionId}` | Read activity identity and basic status. | `{ data: { sessionId, activityCode?, phase, currentRoundId: string | null, stateVersion } }` |
| `GET /sessions/{sessionId}/state` | Read the authoritative current phase snapshot. | `{ data: SessionStateSnapshot }` |
| `GET /sessions/{sessionId}/current-target` | Read current target content when the verified actor and Round phase permit it. | `{ data: CurrentTargetView | null }` |
| `GET /sessions/{sessionId}/results` | Read the current result after the phase is Ended. | `{ data: ResultView[] }` |

### Access, Rate Limit, and Empty-State Rules

- `GET /sessions/by-code/{activityCode}` is the sole anonymous API. It validates and normalizes the code and returns only `sessionId` and phase; it returns no team, participant, Question, Blank, Submission, or Result data. Server-side configurable request throttling applies by request source and normalized code. Exceeding the configured limit returns HTTP `429` with `RATE_LIMITED` in the common error envelope. This lookup does not create an ActorContext, establish membership, or authorize any other request.
- All other activity reads and mutations and all Socket.IO `session:watch` requests require server-verified `ActorContext`. The backend checks authorization; client-side hiding is not an access control.
- `GET /sessions/{sessionId}/current-target` requires a verified ActorContext. If the Session exists but has no current Round, it returns `200 { data: null }` because no question content exists. When a current Round exists, the backend returns its content to a verified Teacher ActorContext with preview access in Waiting, and to an enrolled Participant ActorContext only while the current Round is Active. A Participant request for a target in Waiting or Ended is rejected with `403 FORBIDDEN` and contains no Question/Blank content. Teacher access outside the Waiting preview case follows Teacher Feature authorization policy. An unknown Session remains 404.
- With no current Round, `GET /sessions/{sessionId}/state` returns `200` with phase `Waiting`, null `currentRoundId`, null target reference, and `changedAt` equal to Session `createdAt`; `GET /sessions/{sessionId}/results` returns `200 { data: [] }`.
- `SessionStateSnapshot.changedAt` is derived from persisted timestamps: Session `createdAt` when there is no current Round; current Round `createdAt` in Waiting, `startedAt` in Active, and `endedAt` in Ended. This requires no new Session timestamp column.

`SessionStateSnapshot` contains `sessionId`, `phase` (`Waiting | Active | Ended`), nullable `currentRoundId`, nullable target reference, monotonically increasing `stateVersion`, and `changedAt`. The target is an identifier/reference only; snapshots never contain Question prompts, Blank labels, answers or other question content. With no Round, phase is Waiting and current target is null.

`CurrentTargetView` contains the current `roundId` and a target discriminator plus the Question or QuestionGroup view. Each Question exposes its own dynamic Blank collection; the contract does not assume a fixed Question or Blank count.

## Reserved mutation contracts (owned by later Features)

Foundation owns the shared contract definitions and hands the formal version to the Teacher Feature member for integration. Teacher Feature owns teacher operation entry points, authorization and UI; Student Feature owns enrollment, answer editing and submission. Foundation provides shared lifecycle transitions and data transactions only, and does not determine answer correctness, submission order or the winning Submission.

- Teacher Feature owns Round selection/creation, start, end, next and reopen command entry points and teacher authorization. Commands carry the target reference or `roundId` and an idempotency/request identifier; the server checks Teacher ActorContext. Foundation supplies the shared transition service and transaction boundary called by the owning module.
- Student Feature owns participant enrollment/team selection, draft editing and answer submission. Submit carries `roundId` and a list of `{ blankId, value }`; server derives Team and Participant from verified ActorContext, never trusts a client-supplied team as authority. The trusted Student Feature backend submission service generates `acceptedOrder` from actual acceptance order; the request does not accept a client-authoritative `acceptedOrder`. Foundation persists the field and enforces per-Round uniqueness without generating order or selecting a winner.
- The Feature that owns winner determination supplies the winning Submission. Foundation persistence provides the atomic transaction that replaces the current Result for that logical target; it does not determine the winner.

## Common response and status semantics

- Success: `{ data: T, meta?: { requestId: string } }`.
- Error: `{ error: { code: string, message: string, details?: object }, meta?: { requestId: string } }`.
- `400`: malformed input; `401`: no verified ActorContext for a protected operation (the pre-join code lookup is the sole exception); `403`: authenticated actor lacks permission or phase-based access is denied; `404`: unknown Session/target; `409`: incompatible current phase or duplicate Team/Round submission; `429`: rate limit exceeded (`RATE_LIMITED`); `500`: unexpected internal failure.
- A Session code that does not resolve returns 404 with `SESSION_NOT_FOUND`; do not reveal unrelated activity information.
- Results are available to student views only when Ended. Teacher access is enforced by Teacher Feature policy.
- Teacher/student identity establishment is outside Foundation; shared middleware consumes verified actor context.
- Only the pre-join activity-code lookup omits ActorContext. Its rate limit and minimal summary do not grant membership. All other protected reads require trusted context, and current-target enforces the Waiting/Active role policy on the server.

## Contract validation

Use API contract tests for response envelopes, route-level validation, state visibility and error mappings. Tests must prove that client-provided `teamId` or actor type cannot override server context; the pre-join lookup works without Participant ActorContext, returns only the public summary and enforces 429 throttling; protected reads reject missing/forged context; Teacher preview works in Waiting; Participant current-target is denied in Waiting/Ended and allowed in Active; and no-Round responses follow the documented empty-state shapes.
