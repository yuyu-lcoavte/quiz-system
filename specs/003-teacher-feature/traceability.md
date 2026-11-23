# Traceability: Teacher Feature

Maps every functional requirement and success criterion in [spec.md](spec.md) to the tasks in [tasks.md](tasks.md), the automated tests, and the manual steps in [tests/manual/teacher-feature.md](../../tests/manual/teacher-feature.md). "Manual only" marks items no automated test covers.

Test file shorthand: `unit/`, `api/`, `integration/`, `realtime/`, `web/` are folders under `tests/`; every file name starts with `teacher-`.

## Functional requirements

| Req | Summary | Tasks | Automated tests | Manual |
|---|---|---|---|---|
| FR-001 | One teacher account, password login, logout | T021, T028, T032, T034, T043 | api/teacher-auth, web/teacher-pages | 1.1, 1.2, 1.14 |
| FR-002 | Password stored only as a hash in secure config | T009, T010, T028, T029 | unit/teacher-config, unit/teacher-password | T083 sweep |
| FR-003 | Login cookie 8 h, not page-readable, per-device logout | T021, T032, T034 | api/teacher-auth | 1.14, 1.16 |
| FR-004 | Backend checks Teacher login on every management operation | T021, T033 | api/teacher-auth and every `api/teacher-*` 401 case | 1.15 |
| FR-005 | Teacher identity only on Teacher entry points | T021, T033 | api/teacher-auth (shared `/sessions/...` read → 401), api/teacher-router | 1.15 |
| FR-006 | Per-request, per-Session Teacher context built on the server | T033, T037 | api/teacher-rounds, integration/teacher-end | – |
| FR-007 | Teacher Socket: cookie + Origin, no Student fallback, authorize watch | T025, T038 | realtime/teacher-socket | 1.6 |
| FR-008 | Origin allowlist and CSRF on Teacher mutations | T019, T021, T030, T033 | unit/teacher-csrf, api/teacher-auth, api/teacher-activity | – |
| FR-009 | Login attempt limit | T020, T031 | unit/teacher-login-rate-limit, api/teacher-auth | 1.17 |
| FR-010 | Unique, easy activity code | T022, T035 | api/teacher-activity | 1.3 |
| FR-011 | 1–20 Teams named 第1組… | T022, T035 | api/teacher-activity | 1.3, 1.5 |
| FR-012 | Activity list; refresh restores server state | T022, T035, T043, T044 | api/teacher-activity, web/teacher-pages | 1.2, 1.12 |
| FR-013 | One current Round per activity, one target per Round | T037 | api/teacher-rounds | 1.6 |
| FR-014 | Select target; reject empty group / no-blank target | T023, T036, T037 | api/teacher-rounds | – |
| FR-015 | Start / end only in the right phase | T023, T037 | api/teacher-rounds, web/teacher-pages | 1.7, 1.9 |
| FR-016 | Winner decided by the backend; End consistent with Submit | T024, T037 | integration/teacher-end | 1.9, 2.4 |
| FR-017 | 下一題 opens the next never-opened target | T023, T036 | api/teacher-rounds | 1.6, 1.13 |
| FR-018 | Target statuses; reopen; new result replaces, no-winner clears | T023, T024, T036, T087 | api/teacher-rounds, integration/teacher-end, web/teacher-target-list | 1.10 |
| FR-019 | State changes reach everyone within 2 s | T025 | realtime/teacher-socket | 1.6, 1.7, 2.2 |
| FR-020 | Conflicts rejected; page reloads latest state | T023, T027, T042, T044 | api/teacher-rounds, web/teacher-pages | 1.11 |
| FR-021 | Consistent error messages, no internals | T041, T042 | web/teacher-error-messages, web/teacher-pages | 3.2, 3.9, 4.6 |
| FR-022 | Live monitor; answers hidden until toggled; shown after End; no drafts | T049, T050, T051, T053 | api/teacher-monitor, web/teacher-monitor-panel | 2.1–2.3 |
| FR-023 | No Teacher monitor/result data for students | T049 | api/teacher-monitor (Student cookie 401) | 2.6, 5.9 |
| FR-024 | Full order, winner and answers after End; 無勝者 | T049, T051, T053 | api/teacher-monitor, web/teacher-monitor-panel | 2.4, 2.5 |
| FR-025 | Show service-account email; key only in backend config | T009, T064, T065, T066 | unit/teacher-config, api/teacher-import, unit/teacher-google-sheets-gateway | 3.1, T083 sweep |
| FR-026 | Read the live sheet; tab from the URL or first tab | T057, T061, T064 | unit/teacher-sheet-url, api/teacher-import | 3.3, 3.5 |
| FR-027 | Dynamic structure from headers, merges and markers; 題目 header optional | T056, T058, T062, T088 | unit/teacher-guided-notes-parser | 3.4, 3.10 |
| FR-028 | Vertical 題號 merge = group; multi-marker cell = one question; fill cells | T058, T062, T088 | unit/teacher-guided-notes-parser | 3.3, 3.4 |
| FR-029 | Preview first, nothing saved | T059, T063, T066, T090 | api/teacher-import, web/teacher-import-wizard | 3.3 |
| FR-030 | Question count = 題號 count; blank-to-cell mapping stored | T059, T063 | api/teacher-import | 3.6 |
| FR-031 | Sheet error codes, nothing created on error | T059, T060, T063, T065 | api/teacher-import, unit/teacher-google-sheets-gateway | 3.2, 3.9, 3.10 |
| FR-032 | No re-import after the first Round | T059, T063 | api/teacher-import | 3.11 |
| FR-033 | One write-back of all winners, after a confirmation list | T069, T071, T073 | api/teacher-write-back, web/teacher-write-back-dialog | 4.2, 4.3 |
| FR-034 | Fill cell gets the answer (label unchanged); else after the marker; rewrite replaces | T068, T070, T089 | unit/teacher-cell-composer, api/teacher-write-back | 4.3, 4.4 |
| FR-035 | Changed or missing cell → write nothing | T069, T071 | api/teacher-write-back | 4.6 |
| FR-036 | Untouched targets left alone; previously written no-winner cells restored | T069, T071 | api/teacher-write-back | 4.5, 4.8 |
| FR-037 | CSV: one row per Round × Team, agreed columns | T076, T078, T079, T080 | api/teacher-export, web/teacher-export-button | 5.1, 5.4, 5.5 |
| FR-038 | One answer column 「（1）CPU；（2）OS」; Chinese readable | T075, T076, T077 | unit/teacher-csv, api/teacher-export | 5.2, 5.3, 5.6 |
| FR-039 | Reuse Foundation/Student; additive Teacher tables only | T006–T013, T084 | integration/teacher-migration, api/teacher-router | T084 diagram check |
| FR-040 | End only through the Student trusted coordinator | T024, T037 | integration/teacher-end | 1.9 |

## Success criteria

| SC | Summary | Tasks | Automated tests | Manual |
|---|---|---|---|---|
| SC-001 | Login → activity → import → first round within 3 minutes | T085 | – | **Manual only** (T085 timing) |
| SC-002 | 100% of unauthenticated / forged management calls rejected | T021, T025, T033 | api/teacher-auth, realtime/teacher-socket, every `api/teacher-*` 401 case | 1.14, 1.15 |
| SC-003 | State changes within 2 s on ≥ 2 student clients and Teacher | T025 | realtime/teacher-socket | 1.6, 1.7 |
| SC-004 | Submissions visible to Teacher within 2 s; students see no other Team's data | T049, T050 | api/teacher-monitor, web/teacher-monitor-panel | 2.2, 2.6 |
| SC-005 | End vs Submit always consistent | T024 | integration/teacher-end | – |
| SC-006 | Both templates and a changed layout parse 100% correctly | T056, T058, T088 | unit/teacher-guided-notes-parser, api/teacher-import | 3.3–3.5 |
| SC-007 | Answers in the right cells, labels kept; 0 cells written on conflict | T069, T089 | api/teacher-write-back | 4.3, 4.6 |
| SC-008 | CSV rows = Rounds × Teams; matches the results view | T076 | api/teacher-export | 5.2 |
| SC-009 | Full demo (Teacher + 2 Teams) within 5 minutes | T085 | – | **Manual only** (T085) |

## Items covered only manually

- SC-001 and SC-009 timings (T085).
- Real Google Sheets behaviour (sharing, live preview time, real write-back): US3 and US4 manual steps; automated tests use `tests/helpers/fake-sheets-gateway.ts` and a recorded Sheets API stand-in.
- Opening the CSV in Excel and Google Sheets (5.2, 5.3).
