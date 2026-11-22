# Sheets Gateway Contract (internal)

Location: `apps/server/src/modules/teacher/sheets/` (interface and Google implementation). Every Google Sheets call goes through this interface. Automated tests inject `FakeSheetsGateway` from `tests/helpers/fake-sheets-gateway.ts`; only manual tests use the real one.

```ts
interface SheetRef { spreadsheetId: string; sheetId: number | null }   // null = first tab

interface SheetsGateway {
  /** Values (formatted text) and merges of one tab. */
  readSheet(ref: SheetRef): Promise<{ sheetId: number; sheetTitle: string; values: string[][]; merges: Merge[] }>;
  /** Current text of the given cells; missing cells (outside the grid / deleted tab) → null. */
  readCells(ref: { spreadsheetId: string; sheetId: number }, cellsA1: string[]): Promise<Record<string, string | null>>;
  /** All-or-nothing write of plain text to the given cells. */
  writeCells(ref: { spreadsheetId: string; sheetId: number }, updates: { cellA1: string; text: string }[]): Promise<void>;
  /** Service-account email to show the teacher; null when not configured. */
  serviceAccountEmail(): string | null;
}
```

## Errors (thrown as `HttpError`)

| Condition | Status / code |
|---|---|
| Gateway not configured | 503 `SHEETS_NOT_CONFIGURED` |
| Google 403 (not shared) | 403 `SHEET_NOT_SHARED` |
| Google 404, or `sheetId` not in the spreadsheet | 404 `SHEET_NOT_FOUND` |
| Network error, timeout (10 s), Google 5xx or 429 | 502 `SHEETS_UNAVAILABLE` |

No Google error body, key path or key content is passed to the client or logs.

## Google implementation (`googleapis`)

- Auth: `GoogleAuth({ keyFile: GOOGLE_SERVICE_ACCOUNT_KEY_FILE, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })`. The key path must be outside the repository root (checked at startup); `client_email` read once from the key file.
- `readSheet`: `spreadsheets.get` with `fields=sheets(properties(sheetId,title),merges)`, pick the tab, then `spreadsheets.values.get` on `'<title>'` with `valueRenderOption=FORMATTED_VALUE`.
- `readCells`: `spreadsheets.values.batchGet` for the listed cells.
- `writeCells`: one `spreadsheets.batchUpdate` with one `updateCells` request per cell (`userEnteredValue.stringValue`, `fields: userEnteredValue`); Google applies a batchUpdate atomically.

## URL parsing (`sheet-url.ts`, pure)

Accept `https://docs.google.com/spreadsheets/d/<id>/...` with optional `gid` in the query or fragment; `<id>` = `[A-Za-z0-9_-]{20,}`. Anything else → 400 `INVALID_SHEET_URL`. The full URL is not logged.

## Fake gateway (tests, `tests/helpers/fake-sheets-gateway.ts`)

Holds sheets in memory, records writes, can be set to fail with any of the error codes, and can change a cell between `readCells` calls to simulate another editor.
