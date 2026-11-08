# HTTP API Contract (Foundation)

Base path: `/api/v1`. Payloads and responses use JSON. These contracts define shared boundaries; business authorization and mutations are implemented by the owning Teacher or Student Feature.

## Shared read contracts

| Method and path | Responsibility | Success response |
|---|---|---|
| `GET /sessions/by-code/{activityCode}` | Resolve the student-facing code to an activity summary. | `{ data: { sessionId, title?, phase, currentRoundId?, stateVersion } }` |
| `GET /sessions/{sessionId}` | Read activity identity and basic status. | `{ data: { sessionId, activityCode?, phase, currentRoundId?, stateVersion } }` |
| `GET /sessions/{sessionId}/state` | Read the authoritative current phase snapshot. | `{ data: SessionStateSnapshot }` |
| `GET /sessions/{sessionId}/current-target` | Read the current Question or QuestionGroup and dynamic Blank list(s). | `{ data: { roundId, target: { kind: "question" | "questionGroup", id, questions: QuestionView[] } } }` |
| `GET /sessions/{sessionId}/results` | Read the current result after the phase is Ended. | `{ data: ResultView[] }` |

`SessionStateSnapshot` contains `sessionId`, `phase` (`Waiting | Active | Ended`), nullable `currentRoundId`, nullable target reference, monotonically increasing `stateVersion`, and `changedAt`. With no Round, phase is Waiting and current target is null.

## Reserved mutation contracts (owned by later Features)

These shapes are planned so both modules share a boundary; Foundation does not implement these business operations.

- Teacher Feature owns Round selection/creation, start, end, next and reopen commands. Commands carry the target reference or `roundId` and an idempotency/request identifier; server checks Teacher ActorContext.
- Student Feature owns participant enrollment/team selection, draft editing and answer submission. Submit carries `roundId` and a list of `{ blankId, value }`; server derives Team and Participant from verified ActorContext, never trusts a client-supplied team as authority.
- Result creation/replacement is performed by the service that owns winner determination; database transaction preserves one current Result per logical target.

## Common response and status semantics

- Success: `{ data: T, meta?: { requestId: string } }`.
- Error: `{ error: { code: string, message: string, details?: object }, meta?: { requestId: string } }`.
- `400`: malformed input; `401`: no verified ActorContext; `403`: authenticated actor lacks permission; `404`: unknown Session/target; `409`: incompatible current phase or duplicate Team/Round submission; `500`: unexpected internal failure.
- A Session code that does not resolve returns 404 with `SESSION_NOT_FOUND`; do not reveal unrelated activity information.
- Results are available to student views only when Ended. Teacher access is enforced by Teacher Feature policy.
- Teacher/student identity establishment is outside Foundation; shared middleware consumes verified actor context.

## Contract validation

Use API contract tests for response envelopes, route-level validation, state visibility and error mappings. Tests must prove that client-provided `teamId` or actor type cannot override server context.
