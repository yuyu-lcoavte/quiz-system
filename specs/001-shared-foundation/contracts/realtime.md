# Socket.IO Realtime Contract

Socket.IO attaches to the same Express HTTP server. Subscriptions are session-scoped and authorized by server-side ActorContext. The Socket.IO socket ID is transport-only and must not be treated as a durable Participant or Teacher identity.

## Events

| Direction | Event | Payload |
|---|---|---|
| Client → server | `session:watch` | `{ sessionId: string }` |
| Server → requesting client | `session:state` | Full `SessionStateSnapshot`: `{ sessionId, phase, currentRoundId, target, stateVersion, changedAt }` |
| Server → session room | `session:state:changed` | Same full snapshot, emitted after the state transaction commits. |
| Server → requesting client | `session:error` | `{ code, message, requestId? }` |

The `session:watch` handler validates Session access, joins a server-managed room named from the Session ID, and responds with the latest state snapshot. Repeating watch after reconnect also yields a fresh snapshot; stale or missed broadcasts are never the source of truth. Teacher commands remain HTTP contracts and emit resulting state through the shared room; Student does not send authoritative phase mutations.

## State and timing rules

- `phase`: `Waiting | Active | Ended`.
- `stateVersion` increases for every phase or current-Round change. Clients ignore snapshots older than their current version and can request a fresh snapshot through `session:watch` or `GET /sessions/{sessionId}/state`.
- On next target or reopen, server creates a distinct Round in Waiting and broadcasts its snapshot.
- Start activates that existing Round and broadcasts Active. End changes it to Ended and broadcasts Ended/result availability.
- Under a normal connected local network, both clients must display the new version within 2 seconds of server commit.
- On reconnect, fetch a complete snapshot even when optional Socket.IO connection-state recovery succeeds; recovery can optimize delivery but cannot replace current-state reconciliation.

## Error and security rules

- Invalid or unauthorized watch receives `session:error`; it must not join the room.
- Clients cannot choose a room name, set a phase, choose a stateVersion, or claim a Teacher/Team identity in event data.
- Do not log credentials, access tokens or full sensitive identity claims.

## Verification scenarios

1. Two authorized clients watch one Session; a phase change reaches both with the same stateVersion.
2. Unrelated Session clients receive no event.
3. Disconnect during one or more transitions; reconnect and watch; client receives only the latest authoritative snapshot as its reconciliation baseline.
4. Simulate next and reopen: each creates a new Waiting Round; explicit Start changes that same Round to Active.
