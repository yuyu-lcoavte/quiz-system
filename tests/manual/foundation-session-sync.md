# Foundation Session Sync 驗收

## 驗收方式與限制

本階段沒有正式教師登入、教師操作頁、學生加入頁或學生作答頁，也沒有公開的活動生命週期命令 API。為避免建立正式環境可繞過驗證的測試後門，Session/Round 建立、可信 ActorContext 與教師生命週期操作目前透過隔離 SQLite 的 Vitest 整合 Harness 驗證。以下步驟可在 Windows VS Code 終端機重現；它會啟動實際 Express/Socket.IO localhost server，並以 server-side test resolver 模擬授權 Client。

## 啟動與執行

在專案根目錄的 PowerShell 終端機執行：

```powershell
npm install
npm run build
npm test -- --run tests/realtime/session-state.test.ts tests/api/foundation-api.test.ts
```

生產／Demo 後端的匿名查詢節流可透過伺服器環境變數 `ACTIVITY_CODE_LOOKUP_MAX_REQUESTS`（預設 `30`）及 `ACTIVITY_CODE_LOOKUP_WINDOW_MS`（預設 `60000` 毫秒）設定；非法或超出安全範圍的值會在啟動時拒絕。

測試 Harness 會建立獨立暫存 SQLite，套用正式 Migration，插入測試 Session、Question、Team，並在測試結束時清理。HTTP 與 Socket.IO 使用隨機 localhost port；不會修改開發資料庫。若要另外查看基礎前後端頁面，可在另一個終端執行 `npm run dev`，但該 UI 尚沒有生命週期操作。

## 驗收情境

### Session、Round 與授權操作

1. `tests/realtime/session-state.test.ts` 的 `beforeEach` 建立兩個 Session、題目與 Team；初始 Session 沒有 Round。
2. Harness 透過 `createHttpServer` 的伺服器端 ActorContext resolver，以測試 token 對應可信 Participant Context。未提供 token 的 Client 會收到 `UNAUTHENTICATED`，且不會進入 Session Room。
3. `selectTarget`、`startRound`、`endRound` 是只供受信任模組呼叫的 Foundation service，沒有對外測試路由。它們依序建立 Waiting Round、啟用同一 Round、結束同一 Round。
4. 同一測試另選下一題及重新開啟題目，確認兩者都先進入 Waiting，且每輪 `currentRoundId` 不同。非法轉換會被拒絕。

### 兩個 Client、隔離與 2 秒同步

1. `broadcasts post-commit Waiting → Active → Ended...` 測試連線兩個授權 Socket.IO Client，讓兩者 watch 同一 Session。
2. 測試先建立事件接收器，再呼叫生命週期服務；兩個 Client 必須收到相同完整 snapshot 與 `stateVersion`。
3. 每次交易提交到兩個 Client 收到事件的本機耗時都必須小於 2,000 ms。
4. `authorizes watches... and isolates Session rooms` 讓另一個 Client watch 不同 Session，確認它不會收到第一個 Session 的事件。
5. snapshot 只包含 phase、Round/target reference、版本與時間，不含 Question prompt、Blank 或答案內容。

### Ended、Result 與重新連線

1. End 測試先建立 Submission，將該 Result 作為 owning Feature 提供的資料傳入 `endRound`；Foundation 不挑選勝者。
2. 在收到 Ended 廣播時，測試同步查詢 SQLite，確認 Result 已持久化。若未提供有效勝者，`results` 保持空陣列。
3. `reconciles the latest snapshot after reconnect...` 中斷後重新連線並再次 watch；Client 必須收到最新 Active snapshot，而非過期 Waiting 狀態。
4. `tests/api/foundation-api.test.ts` 驗證 Participant 在 Waiting 不能取得題目、Active 可取得，且只有 Ended 後可讀取結果；也驗證無 Round 的 state、`{ data: null }` target 及 `{ data: [] }` results。

## 預期結果與未完成範圍

- 所列 Vitest 測試全部通過；同步時間由 localhost 整合測試量測，不代表外部網路 SLA。
- 目前沒有可手動登入操作的 Teacher UI，也沒有正式 Teacher 命令端點或 Student enrollment/answer UI。需透過上述 test Harness 驗收生命週期與雙 Client 同步。
- 正式教師登入、授權政策與命令入口由 Teacher Feature 提供；Student Feature 提供加入與提交流程。兩者透過 Foundation 的服務、DTO 及 Socket.IO 契約整合。
