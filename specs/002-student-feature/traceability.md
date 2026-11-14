# Student Feature 需求追蹤

對照 [Spec](spec.md)、[Tasks](tasks.md) 與 [Windows 人工驗收紀錄](../../tests/manual/student-feature.md)。下表以檔名標示實作及自動化證據；Server 檔案位於 `apps/server/src/`，Web 檔案位於 `apps/web/src/`，測試位於 `tests/`。本次測試結果見 [Quickstart](quickstart.md)。

## Functional Requirements

| 需求 | Tasks | 實作 | 自動化證據／待驗 |
| --- | --- | --- | --- |
| FR-001 共用路由 | T047、T049–T050、T054 | `router.tsx`、`StudentJoinPlaceholder.tsx`、`StudentSessionPlaceholder.tsx` | `student-join-pages.test.tsx`、`student-result-state.test.tsx` |
| FR-002 匿名限流查詢 | T017、T021、T050 | `student-identity-client.ts`、`join-options-service.ts`、`session-query-service.ts` | `student-join-options.test.ts`、`foundation-api.test.ts` |
| FR-003 既有組別／晚到加入 | T018、T021–T023、T047、T050 | `join-options-service.ts`、`enrollment-service.ts`、`StudentJoinPlaceholder.tsx` | `student-enrollment.test.ts`、`student-join-pages.test.tsx`；晚到瀏覽器操作待驗 |
| FR-004 原子指派及離線遞補 | T005–T007、T018–T020、T022、T024–T026、T062–T066 | `004-student-team-join-order.sql`、`enrollment-service.ts`、`team-change-service.ts`、`leader-failover-service.ts`、`student-membership-sockets.ts` | `student-leader-reconnect.test.ts`、`student-team-change.test.ts`、`student-migration.test.ts`；T066 瀏覽器結果另記，教師轉交受 T004 限制 |
| FR-005 Cookie 與轉組時限 | T019–T020、T023–T024、T051 | `student-identity-service.ts`、`enrollment-controller.ts`、`team-change-service.ts` | `student-identity.test.ts`（API）、`student-team-change.test.ts` |
| FR-006 無效代號及錯誤隱私 | T017、T021、T047、T050 | `join-options-controller.ts`、`StudentJoinPlaceholder.tsx` | `student-join-options.test.ts`、`student-join-pages.test.tsx` |
| FR-007 Waiting 不揭露題目 | T029、T039、T042、T049、T054 | `session-controller.ts`、`draft-service.ts`、`StudentSessionPlaceholder.tsx` | `foundation-api.test.ts`、`student-draft.test.ts`（API）、`student-result-state.test.tsx` |
| FR-008 Active 與成員授權 | T011–T012、T029、T039、T052、T054 | `student-identity.ts`、`session-controller.ts`、`StudentTargetEditor.tsx` | `student-identity-middleware.test.ts`、`student-vite-proxy.test.ts`、`student-activity-draft.test.tsx` |
| FR-009 動態逐格填答 | T027、T029、T048、T052 | `draft-service.ts`、`StudentTargetEditor.tsx` | `student-draft.test.ts`（API）、`student-activity-draft.test.tsx`、`student-vite-proxy.test.ts` |
| FR-010 題組共同提交 | T033、T035–T037、T048、T052–T053 | `submission-validation.ts`、`submission-service.ts`、`StudentTargetEditor.tsx` | `student-submission.test.ts`、`student-activity-draft.test.tsx` |
| FR-011 無 Blank 禁止提交 | T033、T035、T048、T052–T053 | `submission-validation.ts`、`StudentSubmissionControls.tsx` | `student-submission.test.ts`、`student-activity-draft.test.tsx` |
| FR-012 持久化共同草稿 | T008、T027–T032、T048、T053 | `draft-repository.ts`、`draft-service.ts`、`student-draft-socket.ts`、`draft-client.ts` | `student-draft-persistence.test.ts`、`student-draft.test.ts`（Realtime）、`student-draft-client.test.ts`；雙瀏覽器及隔離待驗 |
| FR-013 後端確認組長提交 | T011–T014、T033、T035–T037、T048、T053 | `student-identity.ts`、`submission-service.ts`、`StudentSubmissionControls.tsx` | `student-csrf.test.ts`、`student-submission.test.ts`、`student-activity-draft.test.tsx` |
| FR-014 非空白及目標驗證 | T033、T035–T037、T048 | `submission-validation.ts`、`submission-service.ts` | `student-submission.test.ts`、`student-activity-draft.test.tsx` |
| FR-015 同組同輪唯一及鎖定 | T033–T038、T048、T053 | `submission-service.ts`、`draft-repository.ts`、`student-draft-socket.ts`、`StudentDraftPanel.tsx` | `student-submission-transaction.test.ts`、`student-draft.test.ts`（Realtime）、`student-activity-draft.test.tsx`；雙瀏覽器鎖定待驗 |
| FR-016 後端接受順位 | T033–T037 | `submission-service.ts`、Foundation `submission-repository.ts` | `student-submission.test.ts`、`student-submission-transaction.test.ts` |
| FR-017 勝者及 End 交易 | T040–T041、T043–T046、T059、T061 | `winner-resolver.ts`、`student-result-service.ts`；Foundation End callback 與 Student Coordinator 待實作 | `student-winner-resolver.test.ts`、`student-result.test.ts` 已驗；Submit／End 競爭、同交易 Result、失敗回滾及 Commit 後廣播仍受 T004 限制 |
| FR-018 重用 Foundation 資料 | T001–T003、T005–T008、T012、T029、T036、T043、T046 | `app.ts`、Foundation repositories、增量 Student migration | `student-migration.test.ts`、`student-repositories.test.ts`、`student-submission-transaction.test.ts` |
| FR-019 權威快照及重連 | T039、T042、T049、T054 | `student-session-state.ts`、`session-state-client.ts`、`student-socket.ts` | `student-session-state.test.ts`、`student-vite-proxy.test.ts`；瀏覽器重連待驗 |
| FR-020 兩秒內同步與資料隔離 | T027、T039–T040、T042、T046、T054、T061 | `student-session-state.ts`、`session-state-client.ts`、`student-result-service.ts` | `student-session-state.test.ts`、`student-result.test.ts`、`session-state.test.ts`；正式 Teacher 觸發的瀏覽器計時待驗 |
| FR-021 Ended 前禁止讀結果 | T040、T046、T049、T054 | `student-result-service.ts`、`StudentSessionPlaceholder.tsx` | `student-result.test.ts`、`student-result-state.test.tsx` |
| FR-022 勝出組及答案投影 | T040、T046、T049、T054 | `student-result-service.ts`、`result-controller.ts`、`StudentSessionPlaceholder.tsx` | `student-result.test.ts`、`student-result-state.test.tsx`；瀏覽器已驗預載的 Demo 結果，正式 Teacher End 待驗 |
| FR-023 新 Round 與結果覆蓋 | T039–T042、T044、T049、T054、T061 | `student-session-state.ts`、`StudentSessionPlaceholder.tsx`、Foundation `foundation-transactions.ts` | `student-session-state.test.ts`、`student-result.test.ts`、`submission-result.test.ts`；Teacher 驅動的換輪／重新開題及 End 整合仍待驗 |
| FR-024 安全且可理解的錯誤 | T009、T013–T015、T017、T027、T033、T047–T054 | `student-router.ts`、`student-identity-client.ts`、`StudentJoinPlaceholder.tsx`、`StudentSessionPlaceholder.tsx`、`StudentSubmissionControls.tsx` | `student-join-options.test.ts`、`student-csrf.test.ts`、`student-submission.test.ts`、三組 Student 頁面測試；手機／桌面操作待驗 |
| FR-025 無帳密及身分恢復 | T007、T011–T012、T019、T022–T023、T047、T051 | `identity-repository.ts`、`student-identity-service.ts`、`student-identity-client.ts` | `student-identity.test.ts`（API）、`student-leader-reconnect.test.ts`、`student-join-pages.test.tsx`；瀏覽器重新整理已驗，短暫離線後身分比對待驗 |

## Success Criteria

### 2026-11-14 failover verification

| Requirement | New tasks | Affected implementation and evidence |
| --- | --- | --- |
| FR-004 / FR-005 | T062–T064, T066 | Enrollment and team-change order, trusted multi-socket presence, ordered fallback and no-candidate handling. `student-leader-reconnect.test.ts` retains a no-candidate case and needs online-successor cases; `student-migration.test.ts` covers the new backfill and constraints. |
| FR-013 / SC-002 / SC-004 | T062, T064–T066 | Existing submission transaction rechecks `team_leaders`; extend `student-submission-transaction.test.ts` for both writer orders and assert former/current leader outcomes with no duplicate submission. |
| FR-024 / FR-025 | T064–T066 | `/me` and Student-only invalidation update current role; add UI coverage for F5, missed notice, obsolete membership response and preserved draft. Browser recheck requires separate identities and a multi-tab case. |

T066 的實測結果記於 [Windows 人工驗收](../../tests/manual/student-feature.md)。T025／T026 和跨模組驗收依賴 T004。見 [Gate 紀錄](../../docs/integration/student-feature-review-gate.md)。

| 準則 | Tasks | 實作 | 自動化證據及人工驗收 |
| --- | --- | --- | --- |
| SC-001 加入 ≤120 秒／無效代號不加入 | T017–T018、T021–T023、T047、T050–T051、T055、T061 | `StudentJoinPlaceholder.tsx`、`join-options-service.ts`、`enrollment-service.ts` | `student-join-options.test.ts`、`student-join-pages.test.tsx`；已觀察到瀏覽器加入成功，三次全新身分的計時仍待測 |
| SC-002 自稱權限無效 | T011–T016、T027、T033、T037 | `student-identity.ts`、`student-draft-socket.ts`、`submission-controller.ts` | `student-identity-middleware.test.ts`、`student-socket-auth.test.ts`、`student-submission.test.ts`；瀏覽器 Cookie／CSRF 檢查待驗 |
| SC-003 N 個 Blank 與零 Blank | T033、T035、T048、T052–T053 | `StudentTargetEditor.tsx`、`StudentSubmissionControls.tsx`、`submission-validation.ts` | `student-activity-draft.test.tsx`、`student-submission.test.ts`；瀏覽器已驗兩題四格的 Demo，零 Blank 由自動化測試覆蓋 |
| SC-004 每輪一筆及可信順位 | T033–T038 | `submission-service.ts`、Foundation `submission-repository.ts` | `student-submission.test.ts`、`student-submission-transaction.test.ts` |
| SC-005 兩秒內更新、重連一致 | T039、T042、T054、T055、T061 | `student-session-state.ts`、`session-state-client.ts` | `student-session-state.test.ts`、`session-state.test.ts`、`student-vite-proxy.test.ts`；正式 Teacher 流程的兩個瀏覽器計時與重連待測 |
| SC-006 結果時機及隱私 | T040、T046、T049、T054、T061 | `student-result-service.ts`、`StudentSessionPlaceholder.tsx` | `student-result.test.ts`、`student-result-state.test.tsx`；正式 Teacher End 後結果驗收待測 |
| SC-007 題目及填空數可變 | T027、T048、T052 | `StudentTargetEditor.tsx`、`student-identity-client.ts` | `student-draft.test.ts`（API）、`student-activity-draft.test.tsx`、`student-vite-proxy.test.ts` |
| SC-008 完整答案與鎖定 | T033–T038、T048、T053、T055、T061 | `submission-validation.ts`、`submission-service.ts`、`StudentDraftPanel.tsx` | `student-submission.test.ts`、`student-submission-transaction.test.ts`、`student-activity-draft.test.tsx`；雙瀏覽器鎖定待驗 |

T004 審閱與 T025、T026、T041、T044、T045、T059 的依賴以 [跨模組 Gate 紀錄](../../docs/integration/student-feature-review-gate.md) 和 [Tasks](tasks.md) 為準。T060 最終回歸與 T061 正式驗收仍依賴已審閱的整合。兩分鐘加入門檻、同一組長身分的瀏覽器重連、正式 Teacher 操作、瀏覽器版面與連線觀察都須記錄實測結果。
