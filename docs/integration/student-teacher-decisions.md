# 課堂搶答系統｜Student × Teacher 跨模組設計決議

> **狀態**：T004 介面及責任分工設計審閱已完成（2026-11-20）。T041／T044／T045 實作與正式安全、整合驗收待完成。Teacher 已對組長離線遞補表示無異議，OpenSpec 同步由 Student 負責人持續處理，尚無完成紀錄。
> **日期**：2026-11-10，更新於 2026-11-20。
> **來源**：`specs/002-student-feature/spec.md` 的 Specify／Clarify 決議、既有 Foundation 能力與共同需求。  
> **對象**：老師端負責人、學生端負責人。

## 一、已確定的共同規則

| 主題 | 決議 | 主要責任 |
| --- | --- | --- |
| 學生加入 | 學生輸入活動代號及識別名稱，選擇組別；後端建立可驗證的活動內身分，無須學生帳密 | Student |
| 晚到加入 | Session 首次進入 Active 後，尚未加入者仍可首次加入已存在 Team；不建立 Team、不改變既有 Participant 的 Team，也不新增停止加入設定 | Student |
| 身分恢復 | 同一瀏覽器在有效憑證仍存在時可恢復原 Participant 與 Team；不能只信任 Cookie 中自行宣稱的 Team ID | Student |
| 組長產生 | 第一位**成功加入** Team 者由後端原子指定為唯一組長 | Student |
| 組長斷線（Teacher 無異議，OpenSpec 同步待紀錄） | 最後有效 Socket.IO 連線中斷後立即依加入順序遞補在線合資格組員。其他連線仍在或無在線候選時維持指派；被替換的組長重連不取回資格。提交權限依伺服器目前指派 | Student |
| 組長轉組 | 搶答首次開始前，原組長轉組時由 Student 後端依加入順序自動遞補，優先選在線者；開始後不得自由換組 | Student |
| 共同編輯 | 草稿以 Team × Round 保存，組員即時共享；同一 Blank 的衝突採**伺服器最後接受修改勝出** | Student |
| 草稿恢復 | 重新整理／重連後恢復伺服器權威草稿 | Student |
| 填空完整性 | 單題多 Blank 必須全部有非空白答案才可提交；題組依既有共同需求完成所有必填項 | Student |
| 提交權限 | 只有可信後端確認的組長可提交；同 Team 同 Round 至多一次成功 Submission | Student + Foundation 資料限制 |
| 提交成功後 | 該 Team × Round 草稿唯讀；進入新 Round 可編輯新草稿 | Student |
| 接受順序 | `acceptedOrder` 由可信後端依實際接受順序產生，不採用前端聲稱值 | Student |
| 勝者選取 | Student 可信後端依成功接受的 Submission 順序選出勝出 Submission，無有效提交則無勝者 | Student |
| 結束本輪 | Teacher 觸發，可信後端協調 Student 勝者服務與 Foundation 的 End／Result 交易 | Teacher + Student + Foundation |
| 學生結果頁 | Round Ended 後顯示**勝出組別名稱與該組成功答案**，不顯示其他組答案和提交順位；無勝者顯示無勝者 | Student |
| 結果資料來源 | Student 提供專用結果投影；不直接修改既有 Foundation 公開 `ResultView` | Student |

## 二、交給老師端的明確結論

### 決議 T-01：取消教師組長操作

首位成功加入及離線自動遞補已涵蓋組長指派與接任，團隊取消教師手動指定或轉交及其授權提案。T025、T026 保留原編號並列為 Cancelled。學生於活動開始前轉組的交接規則保留。

### 決議 T-02：老師端 End 須整合 Student 勝者服務

**請老師端實作**：教師按下 End 的正式 UI／受保護後端入口，只呼叫 `StudentTrustedEndCoordinator.endRound(input, actorContext)`；不得由前端挑選勝者。`round:end` 已由 T004 接受為 Teacher 後端核發的 Session-scoped capability，正式核發與安全驗證仍由 Teacher Feature 實作及測試。

**學生端實作**：驗證已接受的 Submission 與 `acceptedOrder`，選出有效的最早提交者，提供 Student 專用已公布結果投影。

**沿用 Foundation**：End／Result 持久化、Round 狀態、`stateVersion` 與交易後 Socket.IO 通知。

**一致性要求**：Foundation、Student Submission 與 Student winner resolver 使用同一個 `better-sqlite3` Database instance。Coordinator、Foundation transaction port 與 resolver 均為同步呼叫；Foundation 在單一外層 `BEGIN IMMEDIATE` 交易中檢查 Session／目前 Round／Active／預期版本，呼叫同步 resolver、完成 End／Result／stateVersion 更新並 Commit。Commit 後呼叫狀態通知，不等待送達；通知失敗須記錄，已提交的 End 仍回傳成功快照。不得在交易內等待 Promise，也不可先查勝者、稍後再 End。無 Submission 時不建立 Result，並依 Foundation 既有行為清除同邏輯目標舊結果。

### 決議 T-03：目前不擴充 Foundation 對外契約

Student 結果頁所需的組別名稱、答案明細，採 Student 專用的結果投影提供；Foundation 原有 `ResultView` 仍維持既有語意，避免更改已完成的共同契約。

## 三、已審閱介面與後續實作驗證

以下依第五節記錄設計接受狀態與實作驗收責任：

| 項目 | 設計狀態與責任 | 驗收重點 |
| --- | --- | --- |
| Teacher 單一 End 呼叫與交易內 Student winner callback | T004 已接受介面與分工；Student／Foundation 負責 T044／T045，Teacher 接上唯一 Coordinator 入口 | 結束與提交並發時結果一致、Rollback 不廣播、Commit 後通知且通知失敗不改變成功結果 |
| Student 專用結果投影 API／DTO | 沿用 Student 契約與既有投影，正式 Teacher End 路徑待整合驗證 | 只在 Ended 顯示、只提供勝者組名／答案，不外洩其他組 |
| Student 草稿事件與同步 DTO | 沿用 Student 契約與既有草稿同步，跨模組驗收依後續任務執行 | Team／Round 隔離、最後接受修改生效、重連恢復、不與 Foundation 事件衝突 |
| 老師端題目匯入／Guided Notes 回寫細節 | Teacher | 依共同需求處理，與 Foundation 題目結構相容 |

**跨模組整合原則**：優先在既有 Express Server 內使用可信應用服務的介面協調；若要新增 HTTP／Socket.IO 對外事件，必須先提出契約並完成雙方審查，不能任一方自行當作既有功能。

## 四、後續分工與驗證

- **Student／Foundation**：T004 設計 Gate 已完成；後續以 T041 測試先行、T044 同交易 Port、T045 正式組裝驗證已接受的介面。T045 同時修正 `app.ts` 的 Student Socket 失效 fallback。OpenSpec 組長規則同步由 Student 負責人處理。
- **Teacher**：依第五節實作專用 HTTP 入口、可信 `round:end` 核發及 Cookie／Origin／CSRF 防護，透過既有 Server 組裝呼叫唯一 Coordinator。教師 Socket 授權與學生路徑隔離須經正式測試。
- **雙方共同驗證**：首位組員同時加入的競爭、組長斷線遞補、草稿衝突與恢復、只有組長能提交、結束和提交同時發生、雙 Client 同步、跨 Session／Team 隔離及無勝者結束。

### 給老師端組員的一句話

> T004 已接受第五節的介面及責任分工設計。老師端提供受保護的結束入口並核發 `round:end`，只呼叫 Student Coordinator；Student 選取勝者，Foundation 在同一交易儲存 End／Result，Commit 後通知。程式組裝、安全測試與正式跨模組驗收依 T041／T044／T045 及後續驗收完成。

## 五、T004 跨模組審閱紀錄

- **審閱者**：Teacher Feature 負責人
- **日期**：2026-11-20
- **老師端分支**：`feature/teacher`
- **審閱範圍**：Teacher End 入口、`round:end` 授權、Foundation 同交易 callback、組裝方式；不重開已定案之 Student／Teacher／Foundation 責任分工。
- **學生端暨 Foundation 負責人審閱**：2026-11-20，依負責人於本次工作階段的審閱確認，接受本機已合併 PR #4 更新之 5.1～5.4 的介面及責任分工設計，包含 5.2 的 Socket 隔離、Foundation-owned Input、交易範圍、推播、409 恢復與組裝責任。此紀錄不代表 T041／T044／T045 程式與安全測試已完成。

### 5.1 接受的介面

| 項目 | 結論 |
| --- | --- |
| 權限名稱 `round:end` | 接受。由 Teacher middleware 於伺服器端核發，不接受客戶端宣稱。 |
| Teacher ActorContext | 接受既有 `ActorContext` 型別，不修改 Foundation 型別。系統僅一個老師帳號，HttpOnly Cookie 只證明老師身分、不綁定活動。Teacher HTTP 解析器**只對老師專用路徑**（例如 `/api/v1/teacher/...`）生效，依該路徑中的 sessionId 確認 Session 存在後，臨時產生 `{ actorKind:'teacher', actorId:'teacher', sessionId, permissions:['session:read','session:watch','target:preview','target:read','results:read','round:end'] }`；對共用的 `/api/v1/sessions/:id/...` 讀取路徑不產生老師身分。老師頁面所需的狀態、題目、結果由老師專用 API 提供，具體路徑於 Teacher plan 決定。 |
| 單一 End 呼叫 | 接受。Teacher 後端只呼叫一次 `StudentTrustedEndCoordinator.endRound(input, actorContext)`，input 為 `{ sessionId, roundId, expectedStateVersion, requestId }`，requestId 由 Teacher 後端產生；回傳 commit 後的 `SessionStateSnapshot`。前端不指定勝者。 |
| 錯誤對應 | 接受 401／403／404／409；Teacher 另行處理 400 `INVALID_INPUT` 與 500（含 SQLite busy），轉為畫面提示。 |
| Foundation `endRoundWithWinnerResolver` | 接受：同一 `better-sqlite3` Database instance、單一外層 `BEGIN IMMEDIATE`、同步 resolver callback、無勝者時清除同一邏輯目標舊 Result、失敗 rollback 且不推播、commit 後才推播。 |
| 實作負責 | T044、T045 依原 tasks.md 由 Student 負責人實作；Teacher 只呼叫 coordinator。 |
| FR-004 組長斷線遞補 | Teacher 無意見；同步 OpenSpec 由 Student 負責人處理。 |

### 5.2 需修改或補充

1. **Socket 授權方式調整**：Foundation `resolveSocketActorContext(socket)` 無法取得 watch payload 的 sessionId。Teacher 的 Socket 解析器只驗證老師身分，回傳不含 `sessionId` 的老師 ActorContext；Session 存在與 `session:watch` 權限改由 `authorizeWatch(actor, sessionId)` 檢查。Teacher Socket 連線不得帶 `auth.sessionId`，避免進入 Student handshake。無需修改 Foundation 的 `socket-server.ts`、`session-events.ts` 或 `ActorContext` 型別；但 `app.ts` 的學生身分 fallback 需調整（見下）。
   - **現況（2026-11-20 對照程式碼）**：
     - Handshake：Student middleware（`apps/server/src/modules/student/realtime/student-draft-socket.ts` 的 `registerStudentDraftSocket`）只在 `auth.sessionId` 存在時走學生驗證；sessionId 格式錯誤、Origin 不在白名單或 Cookie 解析失敗時直接拒絕連線，不會退回其他驗證。`auth.sessionId` 不存在時直接放行，**不檢查 Origin 或任何身分**。
     - Watch：`apps/server/src/app.ts` 的 `resolveSocketActorContext`（約第 66～70 行）在每次 `session:watch` 時重新解析學生身分；若 handshake 時已是學生 Socket、但重新解析失敗（例如憑證已失效），會**退回呼叫外部 `options.resolveSocketActorContext`**，也就是日後的 Teacher resolver。這不符合下列規則，必須調整。
     - `authorizeWatch`（約第 72～73 行）：不在 `studentActors` 中的身分一律交給外部 `options.authorizeWatch`。
   - **Teacher Socket 驗證規則**：
     - Teacher 身分必須同時驗證有效的老師簽章 Cookie 與 Origin 白名單。
     - 身分只由驗證通過的伺服器端憑證決定；`auth.sessionId` 只決定走哪一條驗證路徑，不代表身分。
     - 走學生路徑（有 `auth.sessionId`）時，學生驗證失敗即拒絕，不得退回嘗試 Teacher resolver 或其他 resolver；handshake 與每次 watch 皆適用。
     - 走老師路徑（無 `auth.sessionId`）時，老師 Cookie 或 Origin 驗證失敗即拒絕。
     - `authorizeWatch` 須驗證：身分物件由伺服器端可信的 Teacher resolver 產生（例如由 Teacher 模組以 `WeakSet` 登記其產生的 ActorContext，不依賴前端傳來的任何欄位）、`actorKind` 為 `teacher`、具備 `session:watch` 權限、Session 存在。
   - **調整位置與負責**：
     - `apps/server/src/app.ts` 的 `resolveSocketActorContext`：Socket 帶有學生 handshake 身分時，重新解析失敗應回傳 `null`，不得退回外部 resolver。由 **T045**（Student 負責人，同時處理 composition root 組裝）負責。
     - Teacher Socket resolver 的 Cookie 簽章與 Origin 驗證、遇到帶 `auth.sessionId` 或已有學生身分的 Socket 時回傳 `null`、可信身分登記及 `authorizeWatch` 檢查：由 **Teacher 實作**負責，透過 `startServer` 傳入的 `resolveSocketActorContext`／`authorizeWatch` 接上。
2. **型別命名與依賴方向（T044）**：`FoundationLifecycleEndPort` 不得以 Student 的 `StudentEndRoundInput` 為參數型別；T044 在 Foundation 定義自己的輸入型別（名稱由實作者決定，不得與既有 `EndRoundInput { roundId, endedAt, expectedStateVersion, result? }` 同名），coordinator 對齊此型別。文件中 coordinator 輸入一律稱 `StudentEndRoundInput`。
3. **範圍檢查（T044）**：交易內須驗證 Round 屬於 `input.sessionId` 且為該 Session 目前 Round，不符回 404／409。
4. **推播語意（T044 與文件）**：現行實作在 commit 後同步呼叫 `publish()`、不等待送達；文件「非同步派送」改為「commit 後呼叫、不等待送達」。publish 失敗不得讓已 commit 的 End 回報為失敗（需 try/catch 並記錄）。
5. **requestId 語意**：目前僅供追蹤與日誌，不提供冪等；重複 End 以 409 處理：可能回 `STALE_STATE`（版本已變）或 `INVALID_PHASE`（Round 已非 Active），Teacher 收到任一種都重新讀取最新狀態後再顯示。
6. **組裝（T045）**：`createHttpServer` 建立 coordinator（注入同一 Database、Foundation port、`StudentWinnerResolver`），並與 `SessionLifecycleService` 一同提供給 Teacher router；`startServer` 傳入 Teacher 的 `resolveActorContext`、`resolveSocketActorContext`、`authorizeWatch`。`router.ts` 新增 Teacher router 掛載點。以上為新增組裝，不改 Foundation 公開 HTTP、DTO、Socket.IO 契約。

### 5.3 已知風險（不阻擋 T004）

- 同一瀏覽器同時持有老師與學生 Cookie：因 Teacher HTTP 解析器只對老師專用路徑生效，學生頁面呼叫共用 `/sessions/:id/...` 讀取路徑時仍以學生身分授權，不會取得老師權限。Demo 時老師與各組學生仍須使用不同瀏覽器設定檔或無痕視窗，因為同一瀏覽器只有一份學生 Cookie，不同學生會互相覆蓋身分。
- Teacher Cookie 簽章驗證、HTTP 寫入操作的 Origin 白名單與 CSRF 防護，以及 Socket 的 Cookie＋Origin 驗證，為**正式整合驗收的必要條件**；未通過不得視為整合完成。具體機制於 Teacher plan 規劃。
- 老師登出後已加入的 Socket room 不會被移除；單一老師本機 Demo 接受此限制。

### 5.4 Gate 狀態

Teacher Feature 負責人的審閱意見與 Student／Foundation 負責人於 2026-11-20 的設計接受紀錄已具備，T004 Gate 完成。5.1 與 5.2 第 1～6 點作為後續實作依據。T041／T044／T045 的設計審閱阻擋解除，仍須依 Tasks 的前置順序執行及驗證。

T004 只確認介面、責任分工與安全規則。T044／T045 程式、安全測試、T041 正式路徑競爭測試及 T059～T061 整合驗收仍待完成。Teacher 負責 Cookie、Origin、CSRF 與 Teacher Socket 驗證；T045 負責 `app.ts` fallback 隔離及組裝測試。OpenSpec 的組長離線遞補同步另行追蹤。

---

**參考**：`docs/integration/teacher-foundation-integration-guide.md`、`specs/002-student-feature/spec.md`、`specs/001-shared-foundation/contracts/`。
