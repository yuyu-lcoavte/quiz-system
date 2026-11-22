# Teacher Realtime Contract

Teacher uses the existing Foundation events only ([Foundation realtime contract](../../001-shared-foundation/contracts/realtime.md)). No new Socket.IO event is added; no Student event is subscribed to or changed.

## Events used

| Direction | Event | Use |
|---|---|---|
| Client → server | `session:watch` `{ sessionId }` | Teacher session page subscribes to the activity it manages. |
| Server → client | `session:state` | Snapshot on watch and re-watch. |
| Server → room | `session:state:changed` | Phase / Round changes after commit; the page refetches `GET /api/v1/teacher/sessions/:id` and, while Active, keeps polling the monitor endpoint every 1 s. |
| Server → client | `session:error` | Unauthenticated or forbidden watch. |

## Identity (implements section 5.2 item 1 of `docs/integration/student-teacher-decisions.md`)

Supplied through `TeacherIntegrationOptions`:

- `resolveSocketActorContext(socket)` (Teacher path, reached only when the socket has no Student handshake identity):
  1. `handshake.auth.sessionId !== undefined` → `null`. (`app.ts` already returns null before reaching Teacher; this is a second guard.)
  2. Handshake `Origin` not exactly in `TEACHER_ALLOWED_ORIGINS` → `null`.
  3. `teacher_session` cookie missing, bad signature, or session row revoked/expired → `null`.
  4. Otherwise return a new `{ actorKind:'teacher', actorId:'teacher', permissions:['session:watch'] }` (no `sessionId`) and add it to the Teacher module's `WeakSet`.
- `authorizeWatch(actor, sessionId)`: `true` only when the actor is in that `WeakSet`, `actorKind === 'teacher'`, permissions include `session:watch`, and the Session exists.

The resolver runs on every `session:watch`, so logout or expiry takes effect on the next watch. A socket already in a room after logout keeps receiving phase snapshots (accepted limitation, section 5.3); snapshots carry no question or answer content.

## Client

The Teacher page uses the existing `apps/web/src/services/session-state-client.ts` without `auth.sessionId` and with credentials, ignores stale `stateVersion`, and re-watches after reconnect.

## Tests

- Valid Teacher cookie + allowed Origin → watch succeeds; receives changes within 2 s.
- Missing/invalid cookie, disallowed Origin, logged-out session → `session:error` and no room join.
- Socket with `auth.sessionId` and a failing Student credential, while the browser also has a valid Teacher cookie → not treated as Teacher.
- Teacher context object created outside the resolver (not in the WeakSet) → `authorizeWatch` false.
