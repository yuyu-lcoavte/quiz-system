# Student Realtime Contract

The existing Foundation `session:watch`, `session:state`, `session:state:changed` and `session:error` events remain unchanged and carry activity state references only. Student answer values use the separate Student-owned events below.

## Connection and Authorization

- Connect to the existing Socket.IO server and same-origin `/socket.io` endpoint.
- The browser automatically sends the opaque `student_session` cookie to the same-origin `/socket.io` endpoint because the cookie uses `Path=/`. Resolve that cookie through the Student trusted identity resolver during the handshake. The handshake may include `{ auth: { sessionId } }` only as a requested resource scope; resolve the matching Session-to-Participant/Team mapping from the database and construct ActorContext server-side. Treat the ID only as a selector; never trust actor/team/leader fields in a payload.
- Reject a browser Origin outside the configured exact-origin allowlist before authorizing the socket. The `student_session` cookie is `HttpOnly` and never passed in Socket auth payload. A missing, expired, revoked, unmapped, or unauthorized cookie/scope must fail the handshake or watch authorization and must not join a Room.
- A socket may join only the server-derived room `student:team:{teamId}:round:{roundId}` after verifying the authenticated Participant belongs to that Team and Session and the requested Round is the current Active Round.
- Clients supply `sessionId` and `roundId` as lookup targets, never a room name or Team ID. The event Session ID must equal the verified handshake scope. The server derives the Team from ActorContext.
- Recheck authentication, membership, Round phase, target Blank and draft status for every edit event. Validate exact Origin on connection and require the session-bound CSRF token on every state-changing socket event; read-only watch does not mutate state.
- Draft edits require the synchronizer CSRF token in the payload. The token is held in memory by the web app, not localStorage.

## Events

| Direction | Event | Payload / behavior |
|---|---|---|
| Client → server | `student:draft:watch` | `{ sessionId, roundId }`; authorized request joins the computed room and receives a full current snapshot. |
| Server → requesting client | `student:draft:snapshot` | `{ sessionId, roundId, version, status, answers[] }`; generated from persisted Team/Round draft. |
| Client → server | `student:draft:edit` | `{ sessionId, roundId, blankId, value, baseVersion, clientMutationId, csrfToken }`; persisted via the same application service as HTTP edit. |
| Server → Team/Round room | `student:draft:changed` | `{ sessionId, roundId, version, answer: { blankId, value, revision }, clientMutationId }`; emitted only after commit. |
| Server → Team/Round room | `student:draft:locked` | `{ sessionId, roundId, version, status: "locked" }`; emitted only after Submission and draft-lock commit. Contains no winner/other-Team data. |
| Server → requesting client | `student:draft:error` | `{ code, message, requestId? }`; safe error, no stack or secret. |

`answers` are `{ blankId, value, revision }[]`; the list is dynamic and contains only the authenticated Team's current draft. A version increments per accepted edit. The last edit committed by the server wins for each Blank. `baseVersion` is diagnostic and does not override that rule. `clientMutationId` is idempotent across HTTP/socket retries.

## Reconnect and Ordering

1. On connect/reconnect, resolve the credential and send `student:draft:watch` again for the current Session/Round.
2. Server revalidates membership and returns the latest persisted snapshot before relying on subsequent events.
3. Client ignores a snapshot/change whose `version` is lower than or equal to the last accepted version. If it detects a gap or the socket reconnects, it requests a full snapshot or calls the draft GET endpoint.
4. The server commits the draft value/version before broadcasting. If the process stops after commit but before emit, the next snapshot is authoritative.
5. After `student:draft:locked`, the UI becomes read-only. Server rejects all subsequent edits even if a client missed the lock event.

## Membership invalidation

| Direction | Event | Payload |
| --- | --- | --- |
| Server → authorized sockets of the affected Team | `student:membership:changed` | `{ sessionId: UUID, teamId: UUID }` |

A pre-start move invalidates both Teams after commit. The server resolves current membership before notifying; clients re-read `/me`. An all-offline assignment is rechecked on an authorized connection or subscription using the existing verified socket presence. The event carries no successor or role data.

- No client event is needed to claim presence or to request reassignment. Count all live authenticated Student sockets for the same Participant and Session, including activity/draft connections and additional tabs. Apply no extra delay after Socket.IO detects the last valid disconnect. A verified connection or authorized re-subscription also rechecks any unresolved offline current leader.
- Deliver after a committed assignment change only, to verified members of the affected Team and Session in every phase. Derive recipients on the server and recheck membership/credential on publish. Do not use Active-only draft rooms for delivery. The notice carries no Participant identity, role claim, credential or draft content.
- Treat this event as an invalidation. Re-read `/me` on event, initial load and reconnect. A newer refresh supersedes an in-flight read. Discard results from an obsolete Session or request, and disable submission until the latest role is resolved. A lost notification is recovered by reading `/me` after reconnect. Foundation events remain unchanged.

## Isolation and Errors

- Team/Round room membership is computed from verified context. A Team cannot watch another Team's draft, and a Session cannot observe another Session's events.
- A non-member, invalid/ended Round, invalid target Blank, bad CSRF token, or locked draft receives `student:draft:error`; an unauthorized socket never joins the room.
- Foundation session-state events do not carry draft versions, answer values, leader changes or submission order.
- No event selects a winner or changes Foundation phase. Teacher lifecycle commands use trusted HTTP/internal services.

## Verification Scenarios

1. Two Participants from one Team watch the same Round and receive identical persisted snapshots and post-commit versioned edits.
2. Two concurrent edits of the same Blank leave the server's last committed value; stale versions cannot roll back newer state.
3. Different Teams and Sessions do not receive each other's draft snapshot/change/lock events.
4. Missing/expired identity, forged Team/actor fields, bad CSRF token, invalid Round/Blank and locked draft are rejected before room broadcast.
5. Refresh and reconnect recover exactly the latest persisted draft version.
6. Submission commits the lock before `student:draft:locked`; failed submission does not lock or publish.
7. Under normal local connection, committed draft edits reach the second authorized client within 2 seconds.
