# Shared Foundation Quickstart Validation

This guide describes the local validation path to implement with the Foundation. It does not claim the commands exist before implementation.

## Prerequisites

- Node.js 22.12+ and npm compatible with the chosen workspace lockfile.
- Dependencies installed from the single repository root.
- A temporary or local SQLite file created through migrations with foreign keys enabled.

## Local run path

1. Install the repository workspace dependencies using the root package manager command recorded during implementation.
2. Start the Vite client and Express/Socket.IO server using the root development command; verify Vite proxies `/api` and `/socket.io` to the server.
3. Open `/` and navigate through all five approved routes. Teacher and Student routes not yet implemented must show placeholders only.
4. Start the server with a temporary SQLite database and apply all migrations.

## Validation scenarios

| Scenario | Action | Expected result |
|---|---|---|
| Route skeleton | Open `/`, `/teacher/login`, `/teacher/dashboard`, `/student/join`, `/student/session/<id>`. | Common layout loads; unimplemented role routes show placeholders. |
| Pre-join activity lookup | Before a Participant ActorContext exists, resolve a valid activity code; exercise malformed/unknown codes and exceed the configured request limit. | The anonymous endpoint returns only `sessionId` and phase; excess requests return HTTP 429 `RATE_LIMITED`. It does not grant access to protected APIs or membership. |
| Data constraints | Create Session without Teams/Rounds; add Question with zero and multiple Blanks; create standalone and grouped Questions. | All states satisfy model rules; no fixed question/blank count is assumed. |
| Cross-Session integrity | Attempt a Round target from another Session, a current Round from another Session, a Submission Team/Round from different Sessions, a Blank outside the target, and a Result winner from another Round. | Composite foreign keys/triggers reject invalid relations; Domain Validation returns actionable errors. |
| Round target | Create a Round targeting one Question, then one QuestionGroup; attempt both/neither targets and an empty QuestionGroup. | Valid targets persist; XOR and empty-target violations are rejected. |
| Empty Session reads | Query state, current target and results before any Round exists. | State is Waiting with null Round/target; current-target returns `{ data: null }`; results returns `{ data: [] }`. `changedAt` matches Session `createdAt`. |
| Phase-based question access | In Waiting, read current-target as an authorized teacher and as a Participant; then start the Round and retry as the Participant. | Teacher preview succeeds in Waiting; Participant receives 403 with no question content in Waiting and can read the target in Active. Realtime snapshots contain no Question/Blank content. |
| Activity lifecycle and result commit | Create/choose target, Start, End, choose next/reopen, Start again, then end the new Round with an owning-Feature-supplied winner if available. | Ended and Result insert/replacement commit atomically; only after commit is Ended broadcast, and the existing result query sees the new Result or an empty array. |
| API error contract | Query unknown activity and submit malformed identifiers. | Stable JSON error envelope and expected HTTP status are returned. |
| Realtime | Connect teacher and two student clients, watch one Session, change phase. | All authorized clients receive same increasing `stateVersion` within 2 seconds; other sessions receive nothing. |
| Reconnect | Disconnect one client, change phase, reconnect and watch. | Client receives full latest snapshot and reconciles to current version. |
| Result overwrite | Complete an initial target round, reopen, complete the new round. | Current Result refers to the new Round/winning Submission; the previous Result is not queryable. |

## Test commands

During implementation, expose root scripts for the complete Vitest suite and focused API, integration and realtime suites. Record actual command names in this guide when those scripts are added. Run automated checks and then manually verify route navigation and the 2-second two-client synchronization criterion.
