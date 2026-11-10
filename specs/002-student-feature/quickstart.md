# Student Feature Quickstart and Validation Guide

This is the planned validation guide for Student Feature after implementation. It does not claim that Student join, cookie authentication, draft editing, submission, Teacher integration or result UI already exist. No test-only public API or production authentication bypass is part of this design.

## Prerequisites

- Windows 10/11 with PowerShell or the VS Code integrated terminal.
- Node.js 22.12+ and npm from the installed Node.js distribution.
- Git checkout on `feature/student` containing the Shared Foundation work.
- The Teacher/Student internal service review for leader transfer and End/winner transaction completed before cross-module integration tests.

## Install, check and start

From the repository root:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

Open `http://127.0.0.1:5173/student/join`. Vite proxies `/api` and `/socket.io` to the existing Express server at `http://127.0.0.1:3000`; keep the app same-origin in local development so the HttpOnly credential cookie works without credentialed cross-origin CORS.

Expected at completion: one Vite app, one Express/Socket.IO process and the existing SQLite file with Foundation plus additive Student migrations. The Student cookie is never available to frontend JavaScript and is not stored in localStorage.

## Join and identity recovery

1. Use a seeded test Session with at least two Teams and a valid Activity Code. Seed data must be created by an isolated Vitest fixture or an authorized Teacher workflow; no public seed endpoint is planned.
2. Open `/student/join`, enter the Activity Code, and verify only activity summary and Team ID/name choices are shown before enrollment.
3. Join a Team with a display name. In browser developer tools, confirm the response sets an HttpOnly, SameSite cookie and does not return its bearer value in JSON.
4. Confirm the first successfully enrolled Participant in a Team is the only leader. Send parallel enrollment requests in the integration test and verify there is still exactly one leader.
5. Advance the fixture Session through its first Active transition, then use a fresh browser credential to join a second existing Team. Verify first-time late enrollment succeeds, no new Team is created, and any existing Participant still cannot change Team.
6. Refresh `/student/session/{sessionId}` and verify the same Participant, Team and leader status are restored from the server mapping.
7. Expire/revoke the test credential in a test fixture; verify protected operations return 401 and UI offers recovery/rejoin without restoring by display name.
8. Submit forged `participantId`, `teamId`, role, leader or `acceptedOrder` fields; verify they are rejected or ignored and never override the server ActorContext.

## Draft, submission and realtime

1. Use a Foundation/Teacher-created Active Round with a Question containing multiple Blanks and a separate QuestionGroup fixture with multiple Questions.
2. Join two browser clients as members of the same Team and Round. Edit different Blanks, then the same Blank from both clients; verify the last server-accepted edit is persisted and both clients converge to the same version/value.
3. Refresh one client and disconnect/reconnect the other; each must recover the persisted snapshot. Verify another Team and another Session never receive the draft.
4. Try blank/whitespace values and omit one target Blank; verify the server rejects submission and leaves the draft editable.
5. Submit once as the server-verified leader. Verify canonical Submission/SubmissionAnswers and draft lock commit together, acceptedOrder is server-assigned, the UI becomes read-only, and subsequent edits/submits fail.
6. Submit as a non-leader or with forged identity fields; verify 401/403 and no persisted Submission.
7. Measure a persisted draft edit to second authorized client under normal local connection; expected display is within 2 seconds.

## End, winner and result

1. Submit from two Teams in one Round and verify the trusted server assigns distinct acceptedOrder values in commit order.
2. Run Submit and Teacher End concurrently using the isolated two-connection integration harness. If Submit acquires the SQLite write lock first, End includes it in winner selection. If End commits first, the later Submit is rejected because the Round is Ended.
3. Verify Ended, stateVersion and Result commit atomically and the existing Foundation `session:state:changed` event is emitted only after commit.
4. Before Ended, call the Student result projection and verify no winner/answers are returned. After Ended, verify only the winning Team name and that Submission's answers are returned; losing Team values and acceptedOrder are absent.
5. End a Round with no accepted Submission; verify `winner: null`, no synthetic Result, and no prior logical-target Result remains visible after reopen/no-winner completion.

## Planned focused automated checks

The following suites are to be created during Tasks; the paths are planned, not current test evidence:

```powershell
npm.cmd test -- --run tests/api/student-identity.test.ts tests/api/student-enrollment.test.ts
npm.cmd test -- --run tests/integration/student-draft-submission.test.ts tests/integration/student-end-race.test.ts
npm.cmd test -- --run tests/realtime/student-draft.test.ts
npm.cmd run check
```

The integration fixtures use a dedicated temporary SQLite database and close/clean it after each suite. They must not mutate the normal development database. Manual acceptance must additionally be performed in a browser with at least two student clients and an authenticated Teacher workflow; passing Vitest alone is not manual acceptance.

## Known limits before implementation

- Foundation has no formal Teacher login/command UI; Teacher integration tests must use a test-only trusted ActorContext fixture and the actual internal service, not a production bypass endpoint.
- Late first-time enrollment into an existing Team is specified; no Teacher-managed admission-stop setting or Student Team creation is included.
- Cross-module internal service names, proposed Teacher capabilities and the Foundation transaction callback require Teacher/Foundation owner review. Until agreed, the concurrency test remains a required integration gate.
