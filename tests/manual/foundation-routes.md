# US1 Manual Route Acceptance

This checklist verifies the Foundation route shell only. Teacher authentication and management, Student enrollment and answering, Excel handling, live quiz behavior, and result determination are not implemented in this phase.

## Start the application

From the repository root in PowerShell:

```powershell
npm install
npm run dev
```

The root development command starts the Express/Socket.IO server at `http://127.0.0.1:3000` and Vite at `http://127.0.0.1:5173`. The route pages are served by the single Vite application. If starting services separately, use two terminals:

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

Open `http://127.0.0.1:5173` in a browser.

## Verify the five approved routes

1. Open `/`. Confirm the shared homepage shows the system title and separate **老師入口** and **學生入口** links.
2. Click **進入老師端** or the header's **老師入口**. Confirm `/teacher/login` shows the Teacher placeholder and a **返回首頁** link.
3. Open `http://127.0.0.1:5173/teacher/dashboard`. Confirm the Teacher management placeholder appears.
4. Open `http://127.0.0.1:5173/student/join`. Confirm the Student join placeholder appears.
5. Open `http://127.0.0.1:5173/student/session/manual-session-42`. Confirm the Student session placeholder shows `manual-session-42` as the Session ID.
6. On a placeholder page, choose **返回首頁** and confirm navigation returns to `/`.

## Verify the route parameter

Replace `manual-session-42` in `/student/session/manual-session-42` with another readable value, such as `class-a-round-3`. Confirm the displayed Session ID changes to match the path segment. This route check only verifies that React Router recognizes and renders the parameter; it does not validate a real Session or access permissions.

## Verify direct open and refresh

Paste each of the five paths above directly into the address bar, rather than navigating from the homepage. After each page loads, refresh the browser. Confirm the same route and page remain available. Vite's development server must serve the single-page application entry for these paths.

## Verify an unknown path

Open `http://127.0.0.1:5173/this-route-does-not-exist`. Confirm a consistent **找不到此頁面** message and a **返回首頁** link appear. Activate the link and confirm `/` loads.

## Expected limits

- The route pages are placeholders that explain which module owns the future feature.
- No login, activity creation, Excel import, enrollment, answer editing/submission, live state updates, or result selection occurs.
- The `sessionId` shown is the route parameter only; this phase does not request or load Session data from the backend.
