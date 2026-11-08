# Research: Shared Foundation

## Decisions

### One Vite client with nested role routes

- **Decision**: Use one React/TypeScript/Vite browser app and React Router route tree for all five confirmed routes. Keep Teacher and Student pages as module-owned placeholders in Foundation.
- **Rationale**: The Constitution and spec require one application and route areas; React Router supports route trees and nested layouts, and Vite provides a React TypeScript starter.
- **Alternatives considered**: Separate teacher/student apps were rejected because they create incompatible frontends and duplicate routing.
- **References**: [Vite guide](https://vite.dev/guide/), [React Router routing](https://reactrouter.com/start/data/routing).

### Tailwind CSS through the Vite integration

- **Decision**: Add Tailwind as the Vite plugin and use one shared stylesheet/design utility layer.
- **Rationale**: Official integration is direct and keeps styling in the existing single client build.
- **Alternatives considered**: A second CSS build pipeline is unnecessary for the Foundation scope.
- **Reference**: [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite).

### Modular Express API in the shared server

- **Decision**: Use one Express server, mount versioned API routers by domain, and keep controllers, services and repositories separate by responsibility.
- **Rationale**: Express Router supports modular mountable route groups; this gives both modules one API boundary without creating separate servers.
- **Alternatives considered**: Independent teacher and student servers were rejected because the users require one shared backend.
- **Reference**: [Express routing](https://expressjs.com/en/guide/routing/).

### Session-scoped Socket.IO rooms with authoritative snapshots

- **Decision**: Join authorized sockets to a server-managed room for their Session and broadcast phase changes after database commit. Every watch/reconnect receives the current state snapshot and monotonically increasing stateVersion.
- **Rationale**: Socket.IO rooms support scoped broadcast. Socket IDs are ephemeral and disconnected sockets can miss messages, so application identity and the REST/socket snapshot must be authoritative; connection recovery is an optimization only.
- **Alternatives considered**: Broadcasting every event globally was rejected because it leaks unrelated activity; relying only on replay was rejected because reconnect does not replace an authoritative current-state read.
- **References**: [Socket.IO rooms](https://socket.io/docs/v4/rooms/), [Socket.IO connection behavior](https://socket.io/docs/v4/how-it-works), [Socket.IO server socket identity](https://socket.io/docs/v4/server-socket-instance).

### SQLite with explicit constraints and transactional lifecycle changes

- **Decision**: Use SQLite migrations, foreign keys, unique constraints, XOR check constraints and transactions. Persist a Submission arrival order per Round and replace the old Result transactionally when the new Round yields its result.
- **Rationale**: The application is local-demo sized; SQLite supports relational integrity and atomic writes. Foreign key enforcement must be enabled for each connection.
- **Alternatives considered**: A remote database adds setup and deployment burden without a current requirement.
- **Reference**: [SQLite foreign key support](https://www.sqlite.org/foreignkeys.html).

### Vitest plus HTTP and socket integration clients

- **Decision**: Use Vitest for unit/integration orchestration, Supertest for Express requests, `socket.io-client` for realtime integration and SQLite temporary databases for persistence tests.
- **Rationale**: Vitest is Vite-native; Supertest and Socket.IO client cover the HTTP and realtime boundaries that unit tests cannot verify.
- **Alternatives considered**: Unit-only testing was rejected because session state and contracts cross process boundaries.
- **Compatibility baseline**: Vitest documentation currently requires Node.js ≥22.12 and Vite ≥6.4; select compatible pinned package versions when implementation starts.
- **References**: [Vitest guide](https://vitest.dev/guide/), [Vitest migration/requirements](https://vitest.dev/guide/migration/).

## Resolved Planning Questions

- **Round creation timing**: Create a Round when a teacher chooses the next target or reopens a target; it starts in Waiting. Start transitions that existing Round to Active.
- **Session's initial state**: A new Session has no Round and is interpreted as Waiting.
- **Result overwrite**: Keep only the current Result for a logical target. Delete the prior Result and insert the new one in the same transaction after the new Round produces a winner.
- **Empty Question**: A Question may contain zero Blanks per FR-005. Submission validation is owned by Student Feature and must reject an unanswerable target.
- **Identity boundary**: Modules receive a server-verified ActorContext. Authentication and participant enrollment are supplied by their owning Features.
- **Storage driver**: `better-sqlite3` is selected for a small local app and concise transaction boundaries; pin a Node-compatible release at implementation time.

## Deferred, Non-blocking

- Both SpecKit members confirmed `master` as the integration branch. Constitution v2.0.0 now records this under the required amendment process; Feature Branch and Pull Request governance remains unchanged. No Git operation was performed.
- The Foundation owner defines the common HTTP, DTO and Socket.IO contract version and hands it to the Teacher Feature member for integration. This ownership decision is not evidence that the other member has reviewed every contract item; changes spanning modules must be coordinated.
- Exact classroom concurrency is unspecified. Do not advertise a capacity target until the team sets one.
