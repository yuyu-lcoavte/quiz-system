# 課堂搶答系統｜Teacher Foundation 介接指南

> **用途**：提供老師端負責人一份可直接參考的共用架構交接文件。  
> **文件日期**：2026-11-10  
> **專案基準**：Shared Foundation `001-shared-foundation` 已完成 T001～T038；Student Feature 正在 `002-student-feature` 的 Clarify → Plan 階段。  
> **重要**：本文件依目前已確認的 SpecKit 規格與實作回報整理，**不是新 API 的核准規格**。實作時，以倉庫中最新程式碼與 `contracts/` 為準。未建立的老師操作、身分驗證與跨模組介面均有明確標示。

## 1. 交接摘要

老師端**直接使用既有 Foundation**，不應另建一個後端、SQLite 資料庫或 Socket.IO 通訊系統。共用基礎已提供 React + TypeScript + Vite 前端、Express + Socket.IO 後端、SQLite 持久化、共用型別、活動狀態及結果儲存服務。

Foundation 的 38 項任務已完成。驗收回報為 16 個測試檔、84 項測試通過；Windows 本機已驗證前後端啟動、共用路由與 Socket.IO polling 握手。**真正的老師登入、題目匯入、管理操作、學生加入作答及真人雙端搶答仍未實作／未完成端到端人工驗收**，請勿將既有佔位頁視為成品。

### 模組責任

| 模組 | 主要職責 | 不應重複實作 |
| --- | --- | --- |
| **Foundation（已完成）** | 共用路由、資料表與 Repository、Migration、資料關係驗證、活動狀態服務、Result 交易、讀取 API、Socket.IO session 同步、共用 Contracts | 不負責帳密登入、答案編輯／提交順位或勝者決定 |
| **Teacher Feature（老師端）** | 老師身分驗證、題目／題組管理與匯入、活動建立及開始／結束操作、組長轉交的老師 UI 與授權入口 | 不應重新建立 Session、Round、Result 的第二套資料模型／儲存服務 |
| **Student Feature（學生端）** | 學生加入及身分恢復、Team／Participant 與組長權限、同組草稿同步、組長提交、後端接受順位、勝者選取、學生結果顯示投影 | 不應重做 Foundation 的生命週期交易、公開 ResultView 契約 |

## 2. 倉庫與環境

- Git 主要整合分支：`master`；老師開發分支建議 `feature/teacher`，以最新 Foundation 已合併的 `master` 為基礎。若老師分支已存在，先確認整合方式，不要覆蓋未提交的修改。
- 前端：`apps/web/`；後端：`apps/server/`；共用型別：`packages/contracts/`。
- Windows 專案根目錄常用指令：

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run dev
```

- 預設開發網址（以實際環境設定為準）：前端 `http://127.0.0.1:5173/`，後端 `http://127.0.0.1:3000/`。
- 開發端啟動時會初始化 SQLite Migration；不要將 `data/` 內的 SQLite 本機資料庫或 `.env` Commit。
- 完整安裝與測試方法：`specs/001-shared-foundation/quickstart.md`。

## 3. 既有前端路由

| 路徑 | 目前狀態 | 老師端應做的事 |
| --- | --- | --- |
| `/` | 共用首頁已完成 | 可沿用老師／學生入口 |
| `/teacher/login` | 老師登入佔位頁 | 實作真正的登入及錯誤處理 |
| `/teacher/dashboard` | 老師管理佔位頁 | 實作教師授權後的管理介面 |
| `/student/join` | 學生加入佔位頁 | 由 Student Feature 接手 |
| `/student/session/:sessionId` | 學生活動佔位頁 | 由 Student Feature 接手 |

**注意**：頁面存在不代表已具備老師登入或存取保護。老師的受保護操作必須在**後端**驗證教師身分與權限。

## 4. 共用資料模型與狀態

主要資料實體：`Session`、`Round`、`Question`、`Blank`、`QuestionGroup`、`Team`、`Participant`、`Submission`、`SubmissionAnswer`、`Result`。

- `Session` 透過 `activityCode` 供學生查找，並以 `currentRoundId`、`stateVersion` 追蹤目前輪次與版本。
- `Round` 只能對應一題 **Question** 或一個 **QuestionGroup**；空 QuestionGroup 可以存為草稿，但**不能當作有效 Round 目標**。
- 單一 Question 可有 0 個或多個 Blank；是否可成功提交由 Student Feature 的實際題目結構與需求驗證。
- 輪次依 `Waiting → Active → Ended` 轉換；下一題／重新開題建立新的 Round ID，不能直接覆寫舊 Round。
- 同一 Team 在同一 Round 至多有一筆成功 Submission；`acceptedOrder` 由可信 Student 後端依提交接受順序產生，老師前端不得指定。
- `Result` 與 `Ended` 由 Foundation 既有交易機制確保持久化一致；沒有有效勝者時不得捏造 Result。

> **整合限制**：Teacher Feature 觸發開始／結束等動作，但不要直接自行更新 SQLite 的 Round 狀態欄位或發布 Socket.IO 事件；應使用可信的後端服務，沿用 Foundation 的交易與版本更新。

## 5. Foundation 既有 HTTP 讀取 API

Base path：`/api/v1`。成功與失敗分別使用已定義的資料封裝（Success／Error Envelope），具體 DTO 請讀 `specs/001-shared-foundation/contracts/http-api.md` 及 `packages/contracts/src/`。

| 方法與路徑 | 用途 | 存取提醒 |
| --- | --- | --- |
| `GET /sessions/by-code/:activityCode` | 依活動代號查找 | 匿名僅可得最小活動摘要；有驗證及速率限制 |
| `GET /sessions/:sessionId` | 取得活動資料 | 依伺服器可信 ActorContext 授權 |
| `GET /sessions/:sessionId/state` | 讀取活動狀態 | 依 Session／Actor 授權，使用權威 `stateVersion` |
| `GET /sessions/:sessionId/current-target` | 查詢當輪題目結構 | Waiting 不能向學生揭露未開放內容 |
| `GET /sessions/:sessionId/results` | 查詢已公布結果 | 學生只能在 Ended 後讀取允許公開的結果 |

已知錯誤狀況包含 400、401、403、404、409、429；請沿用共用 Error Envelope，不要以 UI 警示代替後端檢查。

**現有 ResultView 的資料不足以直接顯示「勝出組別名稱＋成功答案」**；Student Feature 已決定提供學生專用結果投影。請勿假設 Foundation 的公開 ResultView 已包含這些資訊，也不要未經協調直接更改它。

## 6. Socket.IO 介接

Foundation 已有事件（請以 `specs/001-shared-foundation/contracts/realtime.md` 為準）：

| 事件 | 流向 | 用途 |
| --- | --- | --- |
| `session:watch` | Client → Server | 授權後訂閱指定 Session |
| `session:state` | Server → Client | 回傳當前權威狀態快照 |
| `session:state:changed` | Server → Client | 狀態交易 Commit 後通知 |
| `session:error` | Server → Client | 通知監看或授權錯誤 |

- Session Room 由伺服器建立並管理，不接受前端自行指定 Room 或角色權限。
- `SessionStateSnapshot` 主要用來同步狀態參考與版本，**不應假設快照包含完整題目或答案內容**。
- 前端已具備 `apps/web/src/services/session-state-client.ts` Adapter，可供老師／學生功能參考重用；應忽略舊的 `stateVersion`，斷線恢復後重新 watch 取得快照。
- 自動化整合測試已驗證兩個 Client 的狀態同步、Session 隔離、重連及 2 秒內通知的門檻；尚不等於真人雙端完整操作驗收。

## 7. 可信身分與權限

- Foundation 提供共用 `ActorContext` 型別及由可信伺服器解析器注入的 Middleware 邊界；目前 `startServer()` 未配置正式身分解析器。Student Cookie 身分解析由 Student Feature 提供，Teacher 身分解析由 Teacher Feature 提供；未接上可信解析器前，受保護操作必須 fail closed。Foundation 不提供真正的教師帳密登入實作。
- Teacher Feature 必須建立教師驗證／Session 管理，並在後端驗證是授權老師才能操作管理功能。
- 不得信任瀏覽器自行提供的 `teacher`、`teamId`、`isLeader` 或 `acceptedOrder`。
- 既有測試用 ActorContext 注入僅限測試環境，不得用於正式操作。
- Student Feature 的活動內身分不另設帳密；由後端核發可驗證的憑證並支援同瀏覽器恢復。學生身分及組長資格不是老師登入的替代品。

## 8. 老師端必須預留的兩個跨模組介接

這兩項的**責任方向已定**；Student Plan 已提出內部服務介面及新 capability 名稱供 Teacher／Foundation 審閱，尚未表示雙方已逐項程式驗證。老師端不要另行發明公開端點。

### 8.1 組長轉交

- 第一位成功加入某組的學生，由 Student 後端**原子**指定為該組唯一組長。
- 短暫斷線不轉交組長；搶答首次開始前若組長轉組，須先完成明確交接；搶答開始後不可自由換組。
- 原組長無法恢復身分時，由**已驗證的教師**發起指定新組長操作。
- Foundation 既有 ActorContext 權限只有 `session:read`、`session:watch`、`target:preview`、`target:read`、`results:read`，不含組長管理權限。Student Plan 提議新增 `team:leader:transfer` capability 字串，由 Teacher 驗證後放入伺服器建立的 ActorContext；此名稱不是 Foundation 已有 grant，待 Teacher 組員審閱。
- **Teacher Feature 負責**：顯示組員與目前組長、提供「指定新組長」UI，以及可信授權操作入口。
- **Student Feature 負責**：驗證目標組員資格、保證同組同時最多一位組長、以交易完成轉交並提供最新權限狀態。
- **Student Plan 介面提案，尚待 Teacher 組員審閱**：`specs/002-student-feature/contracts/internal-services.md` 提出可信 Teacher 呼叫 Student 後端服務的介面及錯誤；需雙方確認模組註冊方式、權限名稱與狀態回饋。組長狀態可由 Teacher 重讀服務取得，Student 提案目前不新增即時組長廣播事件。

### 8.2 結束搶答、勝者選取與 Result 儲存

**已定的職責流程**：

1. 老師於 Teacher UI 發起「結束本輪」。
2. Teacher 後端只呼叫一個 Student 內部介面：`StudentTrustedEndCoordinator.endRound(input, actorContext)`；前端不得指定勝者。
3. Student coordinator 驗證 Teacher ActorContext 的 `round:end` capability，再把 Student 的同步 winner resolver callback 交給 Foundation lifecycle transaction。
4. Foundation 與 Student 使用同一 `better-sqlite3` Database instance；Foundation 在一個 `BEGIN IMMEDIATE` 交易內呼叫 resolver、持久化 `Ended`／`Result`／`stateVersion`，Commit 後才廣播既有 Socket.IO 狀態。
5. Student 結果投影在 Ended 後公開勝出組別名稱與其成功答案，**不公開其他組答案／順位**；沒有 Submission 時不建立 Result。

**權限與介面狀態**：Foundation 目前沒有 `round:end` capability。Student Plan 提議此字串由 Teacher middleware 驗證後加入 ActorContext；Leader transfer 同理提議 `team:leader:transfer`。兩者皆為新 capability 提案，不是假設 Foundation 已有權限。

**必要並行安全條件**：不允許「先查勝者」與「稍後 End」之間有新提交插入。Plan 的交易內 callback 為內部介面提案，待 Teacher／Foundation 負責人審閱；它不改 Foundation 公開 HTTP、DTO 或 Socket.IO 契約。

## 8.3 活動開始後的首次加入

- Session 首次進入 Active 後，尚未加入的學生仍可首次加入**已存在**的 Team。
- 這是首次加入，不是既有學生轉組；已加入 Participant 首次 Active 後不可轉組。
- Student 不建立 Team，且本專題不新增 Teacher「停止加入」設定。

## 9. 老師端仍須自行完成（Foundation 沒有提供）

- 老師正式登入、權限管理與保護頁面。
- 活動／題目／題組建立及教師操作流程。
- Guided Notes／題目匯入、回寫與輸出（Google Sheets／Excel 等細節依共同需求由老師端確認）。
- 開始、結束、下一題、重開的教師操作入口與錯誤提示。
- 組長指定／轉交的教師 UI。
- 完整 Teacher × Student 整合及實際雙組別 Demo。
- Teacher admission-stop 設定；目前決議允許晚到學生加入既有 Team。

上述未實作部分**不應視為 Foundation 的缺陷**，而是後續 Feature 的工作範圍。

## 10. 建議老師端實作前依序查閱

1. `.specify/memory/constitution.md` — 專案規範與 Diagram First Development。
2. `specs/001-shared-foundation/quickstart.md` — 啟動、測試及環境設定。
3. `specs/001-shared-foundation/contracts/http-api.md` — 既有讀取 API。
4. `specs/001-shared-foundation/contracts/realtime.md` — 事件與 Session Room。
5. `specs/001-shared-foundation/contracts/errors-and-identity.md` — 授權與錯誤。
6. `specs/001-shared-foundation/data-model.md` — 資料實體／交易限制。
7. `packages/contracts/src/`、`apps/server/src/modules/sessions/application/` — 實際型別及服務。
8. `tests/manual/` 與 `diagrams/foundation-*.puml` — 驗收與架構圖。
9. `specs/002-student-feature/spec.md`、`docs/integration/student-teacher-decisions.md` — Student Clarify 最新決議及跨模組責任。

### 交接完成判準

- [ ] 老師端理解 Foundation 可重用能力與不能假設已實作的功能。
- [ ] 老師端納入「教師授權轉交組長」操作與 Student 服務整合點。
- [ ] 老師端 End 操作使用共同確認的可信後端協調流程，沒有自行指定勝者或拆散交易。
- [ ] 正式的跨模組函式／DTO／錯誤契約於 Student Plan 定版後雙方核對。
- [ ] 共同 Demo 時另外驗證真人教師／學生雙端流程。

---

**文件維護**：這是 2026-11-10 的介接基線。Student Plan 與 Teacher 實作若產生實際函式／DTO 路徑，應更新本文件並以 Git PR 留下可追蹤的版本，不應只靠口頭約定。
