# Error and Identity Boundary

## ActorContext

After authentication/enrollment middleware, downstream modules receive a server-created context:

- `actorKind`: `teacher | participant`
- `actorId`: opaque stable identity established by the owning feature
- `sessionId`: activity scope when applicable
- `teamId?`: server-resolved team for participants
- `permissions`: server-computed operation capabilities

Clients may submit a session code, route ID or content fields, but cannot set authoritative `actorKind`, `actorId`, `teamId` or permissions. Teacher Feature owns credential verification; Student Feature owns participant identity, group selection and membership lifecycle. Foundation owns the context shape and middleware seam only.

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
| 401 | `UNAUTHENTICATED` | No trusted actor context exists. |
| 403 | `FORBIDDEN` | Trusted actor is not allowed to access the requested scope/action. |
| 404 | `SESSION_NOT_FOUND`, `TARGET_NOT_FOUND` | Requested activity or target does not exist. |
| 409 | `INVALID_PHASE`, `DUPLICATE_SUBMISSION`, `STALE_STATE` | State conflict, duplicate team-round action or stale state version. |
| 500 | `INTERNAL_ERROR` | Unexpected error; details remain server-side. |

The exact authentication method, cookie/token format and participant enrollment process remain the responsibility of the Teacher and Student Features, not Foundation.
