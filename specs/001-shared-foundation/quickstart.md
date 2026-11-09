# Shared Foundation Quickstart

This guide covers the single React/Vite client, Express/Socket.IO server, shared contracts, SQLite migrations, automated checks and available manual checks. It does not claim that Teacher or Student business features are implemented.

## Prerequisites

- Windows 10/11 with PowerShell or the VS Code integrated terminal.
- Git for Windows.
- Node.js 22.12 or newer and the npm version bundled with Node.js.
- Network access for the initial clone and dependency install.

## Clone and install

Run these commands in PowerShell:

```powershell
git clone https://github.com/yuyu-lcoavte/quiz-system.git
cd quiz-system
npm.cmd install
```

Run npm commands from the repository root unless a step explicitly names the server workspace. The repository has one npm workspace for each of `packages/contracts`, `apps/server`, and `apps/web`; it does not create separate Teacher and Student applications.

## Start the full local application

From the repository root:

```powershell
npm.cmd run dev
```

The root script builds the shared Contracts package, then starts the Express/Socket.IO server and Vite client together. With the default ports, expect:

| Service | Address | Port source |
|---|---|---|
| Express API and Socket.IO | `http://127.0.0.1:3000` | `PORT`, default `3000` |
| Vite web application | `http://127.0.0.1:5173` | Vite config, default `5173` |

Open `http://127.0.0.1:5173/`. Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:3000`. Keep the backend on port `3000` unless the Vite proxy target is updated to match. If either default port is occupied, stop the other process before starting this walkthrough; Vite may otherwise select another port while the proxy remains configured for `3000`.

To start the services separately, use two root PowerShell terminals:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev:web
```

The server workspace script runs with `apps/server` as its working directory. The default relative SQLite path is therefore under `apps/server/data/`. Set `SQLITE_PATH` to `:memory:` for an isolated temporary server run or to an absolute path to choose another file. `PORT` controls the backend port. Anonymous Activity Code throttling is configurable through `ACTIVITY_CODE_LOOKUP_MAX_REQUESTS` (default `30`) and `ACTIVITY_CODE_LOOKUP_WINDOW_MS` (default `60000`).

## Migration path behavior

Startup calls `runMigrations(database)` without joining paths to `process.cwd()`. The runner locates SQL relative to its own `import.meta.url`, so it works when launched from the repository root or when npm has changed the working directory to `apps/server`. For compiled output it also checks the matching source-tree migration directory. The existing SQL remains in `apps/server/src/persistence/migrations/`.

The automated regression test starts the Migration Runner from both working directories and checks the migration file applied:

```powershell
npm.cmd test -- --run tests/integration/migration-location.test.ts
```

## Verify the five routes manually

With the application running, open each URL directly in a browser and refresh it:

1. `http://127.0.0.1:5173/` — shared homepage with Teacher and Student entrances.
2. `http://127.0.0.1:5173/teacher/login` — Teacher login placeholder.
3. `http://127.0.0.1:5173/teacher/dashboard` — Teacher dashboard placeholder.
4. `http://127.0.0.1:5173/student/join` — Student join placeholder.
5. `http://127.0.0.1:5173/student/session/manual-session-42` — Student session placeholder showing the route parameter.

Also open `http://127.0.0.1:5173/this-route-does-not-exist`; it should display the shared 404 page and a link to return home. The route-level automated tests are `apps/web/src/app/router.test.tsx` and the page placeholder/404 tests under `apps/web/src/pages/`.

## Verify the backend responds

With the server running, use a second PowerShell terminal:

```powershell
curl.exe -i http://127.0.0.1:3000/api/v1/sessions/by-code/UNKNOWN-CODE
```

Without a seeded Session, the expected response is HTTP `404` with the common `SESSION_NOT_FOUND` error envelope. This confirms the Express API is reachable; it is not an Activity Code acceptance test.

## Automated checks

Run all TypeScript checks, Vitest tests and workspace builds from the repository root:

```powershell
npm.cmd run check
```

Focused suites:

```powershell
npm.cmd test -- --run tests/api/foundation-api.test.ts
npm.cmd test -- --run tests/integration/data-model.test.ts tests/integration/submission-result.test.ts
npm.cmd test -- --run tests/realtime/session-state.test.ts tests/realtime/session-watch.test.ts
```

## Validation record — 2026-11-10

| Command/check | Actual result |
|---|---|
| `npm.cmd run check` | Passed on 2026-11-10: TypeScript checks, all 16 Vitest files / 84 tests, and all workspace builds. The first sandboxed attempt could not open loopback sockets (`EACCES`); rerunning with local loopback access passed. |
| `npm.cmd test -- --run tests/integration/migration-location.test.ts` | Passed: 3 cases, covering the repository-root cwd, `apps/server` workspace cwd, and source/compiled module path layouts. |
| `java -jar plantuml.jar "./diagrams/*.puml"` | Passed with the project PlantUML 1.2026.9 jar and JDK 25. Regenerated all three Foundation PNGs; visually inspected the updated Component, Class and Sequence diagrams. |
| `npm.cmd run dev` full-stack root command | User-confirmed Windows local run: Vite started at `http://127.0.0.1:5173` and Express started at `http://127.0.0.1:3000`; no `ENOENT` or `EADDRINUSE` occurred. This records the user's actual run; it was not independently restarted by the agent. |
| Browser manual route walkthrough | User-confirmed: shared homepage and Teacher/Student entry links displayed; all four module routes opened; `/student/session/test123` displayed the `test123` route parameter; unknown path displayed 404 with return-home navigation; direct child-page refresh worked. |
| Socket.IO polling handshake | User-confirmed: polling handshake returned HTTP 200 and included `sid`. This verifies the Engine.IO polling connection only; authenticated `session:watch`, room isolation, state broadcast, and reconnect behavior are verified by the automated integration suite rather than a manual role-based browser session. |
| Earlier read-only HTTP smoke against existing listeners | `curl.exe` returned HTTP 200 for `/`, all four role routes, and an unknown route on port 5173. Port 3000 returned HTTP 404 with the expected `SESSION_NOT_FOUND` JSON envelope for an unknown Activity Code. This predates the user's later successful fresh `npm.cmd run dev` run and is not used as evidence for that startup. |
| Prior isolated Server Workspace startup | `npm.cmd run dev --workspace @quiz/server` with `SQLITE_PATH=:memory:` and `PORT=4317` logged `Shared server listening on http://127.0.0.1:4317`; it was stopped with Ctrl+C. |

### Diagram-to-implementation review — T037

- Component Diagram matches the one Web app, one Express/Socket.IO server, shared Contracts and SQLite repository structure. Its note now makes clear that Teacher Feature owns authenticated operation entry points and calls the internal Foundation lifecycle service; Foundation does not expose a Teacher command endpoint.
- Class Diagram relationships and lifecycle semantics match the shared domain and SQLite constraints. No class relationship change was required.
- Sequence Diagram now shows target selection, Start, End and reopen flowing through a future trusted Teacher Feature adapter into the Foundation lifecycle service. The service publishes only after commit; state snapshots remain reference-only. This avoids implying that a Teacher command HTTP endpoint exists in Foundation.
- Ran the required `java -jar plantuml.jar "./diagrams/*.puml"` successfully and regenerated all three PNGs next to their `.puml` files. Opened and inspected the Component, Class and Sequence PNGs; all rendered and the labels are readable. The temporary `plantuml.jar` alias was removed afterward.
- On this machine, bare `java` resolves to an Oracle `javapath` shim that hung even for `java -version`. PlantUML was run with `C:\Program Files\Java\jdk-25\bin` prepended to PATH, using the existing JDK 25 and checked-in PlantUML jar.

### Manual checks still required

- The user completed the browser route walkthrough: homepage/role links, all four module routes, `test123` route parameter, unknown-route 404 and return-home navigation, and child-page refresh were confirmed.
- The user confirmed the Socket.IO polling handshake returned HTTP 200 with `sid`. This does not by itself exercise authenticated `session:watch`, room isolation, snapshot delivery or reconnect.
- The project has no formal Teacher login/command UI or Student enrollment/answer UI. A real role-based two-client lifecycle walkthrough was not performed. Lifecycle, authorization, room isolation, reconnect and post-commit broadcast behavior are covered by the passing localhost integration tests, including the assertion that state changes reach both authorized clients within 2 seconds.
- Formal Teacher authentication, Teacher operation UI, Student enrollment/answer UI, and manual end-to-end role workflow remain for their respective Features; they are outside Shared Foundation's implementation scope.

The manual limitations above are recorded explicitly. Automated integration results do not claim that the unavailable Teacher/Student role-based browser workflow was manually completed.
