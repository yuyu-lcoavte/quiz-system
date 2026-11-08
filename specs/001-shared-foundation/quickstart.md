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
| Data constraints | Create Session without Teams/Rounds; add Question with zero and multiple Blanks; create standalone and grouped Questions. | All states satisfy model rules; no fixed question/blank count is assumed. |
| Round target | Create a Round targeting one Question, then one QuestionGroup; attempt both/neither targets. | Valid targets persist; XOR violations are rejected. |
| Activity lifecycle | Create/choose target, Start, End, choose next/reopen, Start again. | New Round begins Waiting; Start activates the same Round; Ended state is visible. |
| API error contract | Query unknown activity and submit malformed identifiers. | Stable JSON error envelope and expected HTTP status are returned. |
| Realtime | Connect teacher and two student clients, watch one Session, change phase. | All authorized clients receive same increasing `stateVersion` within 2 seconds; other sessions receive nothing. |
| Reconnect | Disconnect one client, change phase, reconnect and watch. | Client receives full latest snapshot and reconciles to current version. |
| Result overwrite | Complete an initial target round, reopen, complete the new round. | Current Result refers to the new Round/winning Submission; the previous Result is not queryable. |

## Test commands

During implementation, expose root scripts for the complete Vitest suite and focused API, integration and realtime suites. Record actual command names in this guide when those scripts are added. Run automated checks and then manually verify route navigation and the 2-second two-client synchronization criterion.
