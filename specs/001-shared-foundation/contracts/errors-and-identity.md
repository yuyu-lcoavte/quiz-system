# Error and Identity Boundary

## ActorContext

After authentication/enrollment middleware, downstream modules receive a server-created context:

- `actorKind`: `teacher | participant`
- `actorId`: opaque stable identity established by the owning feature
- `sessionId`: activity scope when applicable
- `teamId?`: server-resolved team for participants
- `permissions`: server-computed operation capabilities

Clients may submit a session code, route ID or content fields, but cannot set authoritative `actorKind`, `actorId`, `teamId` or permissions. Teacher Feature owns credential verification; Student Feature owns participant identity, group selection and membership lifecycle. Foundation owns the context shape and middleware seam only.

Any test helper that supplies an `ActorContext` MUST be restricted to the test environment and test harness. Production configuration MUST NOT accept a client-supplied or test-generated context as authenticated identity, and MUST fail closed when no trusted feature-owned authentication/enrollment middleware has established the context. Formal teacher authentication and student identity remain owned by their respective Features.

### Pre-Join Public Lookup

The `GET /sessions/by-code/{activityCode}` lookup is the sole exception to the ActorContext requirement: students need to resolve an activity code before enrollment establishes Participant context. It is read-only and returns only `sessionId` and phase; it does not establish membership or grant access to protected activity data. The server validates and normalizes the code and applies configurable rate limiting by request source and normalized code. Exceeding the limit returns HTTP 429 with `RATE_LIMITED`. Every other protected HTTP operation and every Socket.IO watch requires server-verified ActorContext.

## Error Envelope

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "The activity could not be found.",
    "details": {}
  },
  "meta": { "requestId": "opaque-request-id" }
}
```

`details` is optional and must not contain secrets. Error `code` is stable for program behavior; `message` is safe for display or can be mapped to localized UI text.

| HTTP status | Stable codes (initial set) | Meaning |
|---|---|---|
| 400 | `INVALID_INPUT`, `INVALID_ACTIVITY_CODE` | Request shape or values failed validation. |
| 401 | `UNAUTHENTICATED` | No trusted actor context exists for a protected operation; the pre-join code lookup is the sole exception. |
| 403 | `FORBIDDEN` | Trusted actor is not allowed to access the requested scope/action or current Round phase. |
| 404 | `SESSION_NOT_FOUND`, `TARGET_NOT_FOUND` | Requested activity or target does not exist. |
| 409 | `INVALID_PHASE`, `DUPLICATE_SUBMISSION`, `STALE_STATE` | State conflict, duplicate team-round action or stale state version. |
| 429 | `RATE_LIMITED` | Configurable server-side request limit exceeded on the public activity-code lookup. |
| 500 | `INTERNAL_ERROR` | Unexpected error; details remain server-side. |

The exact authentication method, cookie/token format and participant enrollment process remain the responsibility of the Teacher and Student Features, not Foundation.
