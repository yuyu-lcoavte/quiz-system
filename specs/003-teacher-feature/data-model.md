# Data Model: Teacher Feature

Reuses Foundation entities unchanged ([Foundation data model](../001-shared-foundation/data-model.md)). Teacher adds three tables in `apps/server/src/persistence/migrations/006-teacher-feature.sql`. IDs are opaque strings; timestamps are UTC ISO-8601.

## Reused Foundation entities

| Entity | How Teacher uses it |
|---|---|
| Session | Created by Teacher with a generated `activityCode`; `stateVersion` is the expected version for every command. |
| Team | Created with the Session, named `第1組` … `第N組`, N = 1–20. |
| QuestionGroup | One per group target from import; `label` = question number; `position` = target order. |
| Question | One per standalone target, or one per row of a group target. `displayNumber` = question number (group rows: the group number); `questionGroupId` set for group rows; `position` = target order for standalone, row order within the group for group rows. `prompt` is not stored (spec: numbers only). |
| Blank | One per answer cell without a marker, or one per marker in the cell. `label` = marker text such as `（1）` or null; `position` = order within the Question. |
| Round | Created via `SessionLifecycleService.selectTarget`; read for target status. |
| Submission / SubmissionAnswer | Read only, for monitor, results and CSV. |
| Result | Written only by Foundation inside the coordinator's End transaction; read by Teacher. |

**Target ordering**: standalone Questions and QuestionGroups share one position sequence (0, 1, 2…) so "next" can sort targets by position.

## New tables

### `teacher_login_sessions`

| Column | Rules |
|---|---|
| `id_digest` TEXT PK | SHA-256 of the 32-byte random session id; the raw id exists only in the cookie. |
| `issued_at` TEXT | Login time. |
| `expires_at` TEXT | `issued_at` + 8 hours. |
| `revoked_at` TEXT NULL | Set on logout. |

Valid when `revoked_at IS NULL AND expires_at > now`. Expired rows may be deleted at login time.

### `teacher_sheet_sources`

| Column | Rules |
|---|---|
| `session_id` TEXT PK, FK → `sessions(id)` | One Guided Notes source per activity. |
| `spreadsheet_id` TEXT | From the URL. |
| `sheet_id` INTEGER | Tab gid. |
| `sheet_title` TEXT | Tab title at import (used in A1 ranges). |
| `imported_at` TEXT | Confirm time. |

### `teacher_blank_cells`

| Column | Rules |
|---|---|
| `blank_id` TEXT PK, FK → `blanks(id)` | One mapping per Blank. |
| `session_id` TEXT, FK → `teacher_sheet_sources(session_id)` | Scope check. |
| `cell_a1` TEXT | Cell the answer is written to, without sheet name: the fill cell (e.g. `H5`) when the template has one, else the marker cell (e.g. `G5`). |
| `original_content` TEXT | Cell text at import. |
| `marker` TEXT NULL | Marker text, or null when the cell had none. |
| `marker_index` INTEGER | Order of this marker in the cell (0 when no marker). |
| `last_written_content` TEXT NULL | Cell text after the last successful write-back. |
| `last_written_at` TEXT NULL | Time of that write. |

Several Blanks can share one `cell_a1` (one cell with several markers). Unique `(session_id, cell_a1, marker_index)`.

## Derived (not stored) structures

| Structure | Definition |
|---|---|
| Target | `{ kind:'question', questionId }` for a standalone Question, or `{ kind:'questionGroup', questionGroupId }`; number and position from the entity. |
| Target status | `NotOpened` when no Round targets it; otherwise the phase of its latest Round (`Waiting`, `Active`, `Ended`). |
| Import preview | Parser output: targets → questions → blanks with `cellA1`, `marker`, `originalContent`; plus warnings and a SHA-256 `previewDigest`. Not stored; confirm re-reads and must match. |
| Write-back plan | Cell entries `{ cellA1, currentContent, expectedContent, newContent, kind:'write'|'restore' }` and a `planDigest`. Not stored. |
| Monitor row | Per Team: submitted?, `acceptedOrder`, `receivedAt`, answers by Blank. |
| Activity record row | `題號, 第幾輪, 組別, 答案, 順位, 是否勝出, 送出時間` for every Round × Team. |

## Validation rules

- Team count: integer 1–20.
- Activity code: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, unique.
- Import confirm allowed only when the Session has no Round; re-import replaces the previous Questions, Blanks, Groups, blank cells and source in one transaction (Foundation triggers reject deleting anything a Round uses).
- Selecting a target requires every Question in it to have at least one Blank (Teacher check), and Foundation's own checks (no current Waiting/Active Round, non-empty group, same Session, expected version).
- Question numbers unique within one import.
- Write-back expected content = `last_written_content ?? original_content`.

## State transitions

Target: `NotOpened → Waiting → Active → Ended → (reopen) Waiting → …` — each arrow into Waiting creates a new Round. Login session: `valid → revoked` (logout) or `valid → expired` (8 h).
