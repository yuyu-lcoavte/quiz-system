# Implementation Plan: Shared Foundation

**Branch**: `001-shared-foundation` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-shared-foundation/spec.md`

## Summary

建立單一 React/Vite 前端與共用 Express 後端的專案骨架，提供已確認的五個 Route、共用版型與佔位頁、共用 TypeScript 契約、SQLite 資料模型、API／錯誤邊界及 Socket.IO 活動狀態通知。Teacher 與 Student 的完整業務流程留給後續 Feature。Round 在選擇下一題或重新開題時建立為 Waiting；教師開始後才進入 Active。連線中的兩端須在 2 秒內收到狀態更新，重新連線時以最新狀態快照恢復。

## Technical Context

**Language/Version**: TypeScript；Node.js 22.12 或以上（Vitest 官方目前要求 Node.js ≥22.12 與 Vite ≥6.4）

**Primary Dependencies**: React、Vite、React Router、Tailwind CSS、Node.js、Express、Socket.IO、`better-sqlite3`、Vitest、Supertest、`socket.io-client`

**Storage**: SQLite；版本化 schema migrations，啟用 foreign key enforcement；本機資料檔不納入版本控制。

**Testing**: Vitest 單元與前端測試；Supertest HTTP API 整合測試；`socket.io-client` 即時事件測試；SQLite 暫存／記憶體資料庫測試。

**Target Platform**: 本機開發與課堂 Demo；同一 Git Repository、單一前端應用及共用後端。

**Project Type**: Web application with one browser client, one API/realtime server, and one shared TypeScript contract package.

**Performance Goals**: 連線正常時，活動狀態改變於 2 秒內反映在老師與學生端；其餘負載目標依課堂規模，Spec 未指定數值。

**Constraints**: 不建第二套前端；不得把題數、填空數或儲存格位置寫死；Question 可有 0..* Blank；Foundation 不實作教師認證、Excel 流程、正式加入、組長、多編輯、提交、勝負判定、CSV 或完整題組操作；API 與即時契約須讓兩組共用。

**Scale/Scope**: 單一課程、教室及本機 Demo 尺度；精確同時連線人數未在共同需求指定，不作無依據的容量保證。

## Constitution Check

- **需求一致性**: PASS — 依共同需求與 Clarify 決議；未決的欄位與傳輸契約在本 Plan 依使用者指定技術做明確設計。
- **模組化與協作**: PASS — 一個 Web app、一個共用 API/realtime server、一份 shared contracts；Teacher／Student 模組分層，不另建獨立系統。
- **Git 管理與 AI 操作界線**: PASS — 兩位組員已確認 `master` 為共同整合分支，並已依 Governance 將 Constitution 修訂為 v2.0.0；Feature Branch、PR 審查及 AI Git 操作限制維持不變。本次未執行 Git 操作。
- **資料正確性與安全**: PASS — 外部輸入由 API 驗證；授權由伺服器端 middleware 與模組政策執行；憑證不入庫或日誌。
- **測試與品質證據**: PASS — 規劃 unit、API、資料庫、socket 與人工路由／雙端同步驗收。
- **Diagram First**: PASS — 三圖已更新為指定技術分層及一致的資料、狀態流程，PNG 與 `.puml` 同目錄。
- **SpecKit 階段紀律**: PASS — 本文件僅完成 Plan 階段設計，Tasks 與程式碼留待後續命令。

## Phase 0: Research Decisions

詳見 [research.md](research.md)。使用者已指定主要技術，故不比較替代框架；研究聚焦在選定技術的整合方式、SQLite 約束、即時狀態恢復與測試邊界。沒有需要使用者先決定的架構阻塞事項。

## Phase 1: Design

### Architecture

- **Web client (`apps/web`)**: 一套 React/TypeScript/Vite 應用，React Router 配置五個已確認 Route；共用 Layout、首頁、導覽元件及尚未交付的角色頁佔位內容。Tailwind CSS 僅負責樣式。
- **Server (`apps/server`)**: Express 同時提供 `/api` 路由與 Socket.IO；模組依序分為 transport/controller、application service、domain contract、repository。狀態變更由 service 經 SQLite transaction 完成後才廣播。
- **Shared contracts (`packages/contracts`)**: 無框架依賴的 TypeScript domain DTO、API request/response、error 與 socket event schema，供 client、server 共用。
- **SQLite**: migration 建立 schema；foreign keys 每個連線啟用。以 transaction 原子化 Round 狀態、版本及 Result 替換。
- **本機連線**: 開發時 Vite 將 `/api` 與 `/socket.io` 代理至 Express；Demo／build 時由同一 Express 程序提供前端 build 與 API。只有一個前端 app。
- **身分邊界**: API／Socket middleware 將已驗證身分轉成共用 `ActorContext`（kind、actorId、sessionId、可選 teamId）。教師登入方式由 Teacher Feature、學生加入與組別歸屬由 Student Feature 提供；Foundation 不信任客戶端自行宣告的角色或 teamId。
- **活動代碼入口**: 僅 `GET /sessions/by-code/{activityCode}` 作為加入前可匿名呼叫的唯讀入口，因學生此時尚無 Participant ActorContext。只回 `sessionId` 與 phase；伺服器驗證／正規化代碼並套用可設定節流，超限以 HTTP 429 `RATE_LIMITED` 回覆。此入口不建立成員身分。其他活動 API 與 Socket.IO watch 一律要求伺服器驗證 ActorContext。
- **題目存取政策**: `GET /sessions/{sessionId}/current-target` 由後端依可信 ActorContext 與 Round phase 授權；有預覽權限的教師可在 Waiting 讀取，Participant 僅在 Active 讀取。Participant 在 Waiting／Ended 不取得題目內容；state/socket snapshot 只含 phase 與目標識別資訊，不含 Question／Blank 內容。
- **模組責任**: Foundation 提供共用活動狀態轉換服務及其資料交易；Teacher Feature 負責教師操作入口、教師授權與教師介面；Student Feature 負責學生加入、填答與提交。Foundation 不判斷答案正確性、不決定搶答順位，也不判定勝者。勝出 Submission 由後續負責該業務規則的 Feature 提供，Foundation 僅提供結果保存／替換所需的共用原子性邊界。

### Data Model Summary

細節與 SQLite 約束見 [data-model.md](data-model.md)。

| Entity | 核心用途與關係 |
|---|---|
| Session | 一場活動；具內部 ID 與唯一 Activity Code；可建立時沒有 Team 或 Round；指向目前 Round（可空）。 |
| Round | 一次搶答；隸屬 Session，Question 或 QuestionGroup 二擇一；同一題可有多輪。狀態為 Waiting／Active／Ended。 |
| Question | 隸屬 Session，可有 0..* Blank；以可空 `questionGroupId` 表達其所屬 0..1 QuestionGroup；可單獨成為 Round 目標，或屬於一個 QuestionGroup。 |
| Blank | 隸屬一個 Question，以穩定 ID 與順序區分；答案另由 SubmissionAnswer 關聯保存。 |
| QuestionGroup | 隸屬 Session，包含 1..* Question；代表多題共同提交的目標。 |
| Team | 隸屬 Session，可有多個 Participant／Submission。 |
| Participant | 對應一個 Team；登入／持久身分由 Student Feature 提供。 |
| Submission | 對應且只對應一個 Team 與 Round；同組同輪唯一；後端登錄順位可排序。 |
| Result | 每輪至多一筆，指向該輪勝出 Submission；同一目標的新輪完成後，交易內移除舊 Result 並寫入新 Result。 |

### API and Realtime Contracts

契約細節見 [contracts/http-api.md](contracts/http-api.md)、[contracts/realtime.md](contracts/realtime.md) 與 [contracts/errors-and-identity.md](contracts/errors-and-identity.md)。Foundation 負責人主導本版 API、DTO 與 Socket.IO 定義，正式契約供 Teacher Feature 組員介接；此責任決議不代表對方已逐項審閱。任何跨模組契約變更仍須先協調。

HTTP 使用 `/api/v1`，成功與錯誤均採 JSON。Foundation 提供正式共用查詢／型別契約及狀態轉換原語；Teacher Feature 擁有教師操作入口與身份建立，Student Feature 擁有正式加入、填答與提交，勝者判定由後續指定的業務 Feature 負責。所有題目內容存取政策由後端檢查可信 ActorContext 與階段。Socket.IO 以 session room 廣播不含題目內容的 versioned phase snapshot；連線、重新連線或重新訂閱都取得伺服器最新 snapshot，不能只依賴恢復遺失事件。

### Project Structure

```text
apps/
├── web/
│   └── src/
│       ├── app/                 # Router、providers、shared layout
│       ├── components/          # 共用導覽、頁面框架、載入與錯誤狀態
│       ├── pages/               # Home、Teacher/Student placeholders、NotFound
│       ├── features/
│       │   ├── teacher/         # 後續 Teacher Feature 的模組入口
│       │   └── student/         # 後續 Student Feature 的模組入口
│       ├── services/            # HTTP/socket client adapters
│       └── styles/
└── server/
    └── src/
        ├── app/                 # Express 與 Socket.IO 建立、啟動與關閉
        ├── config/              # 環境設定與 SQLite 路徑
        ├── api/                 # Router、middleware、controllers、validation
        ├── modules/
        │   ├── sessions/        # 共用 session/state query 與 service
        │   ├── teacher/         # 後續模組入口，不含登入／管理業務
        │   └── student/         # 後續模組入口，不含加入／提交業務
        ├── realtime/            # room 訂閱、snapshot 與狀態廣播
        ├── persistence/         # SQLite connection、migrations、repositories
        └── errors/              # 統一錯誤轉換
packages/
└── contracts/
    └── src/                     # 共用 entity DTO、API、error、event types/schemas
tests/
├── unit/                        # 純 domain 與 validation
├── api/                         # Express + Supertest
├── integration/                 # SQLite、服務、Round/Result transaction
├── realtime/                    # Socket.IO client/server 同步
└── manual/                      # 人工路由及雙組別 Demo 驗收步驟
specs/001-shared-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
```

**Structure Decision**: 單一 Repository 的 npm workspaces，含一個 web app、一個 server app 與一個共用 contracts package。Teacher 與 Student 以功能模組放在同一 app，不建立第二套前端或第二個 repository。

### State and Transaction Design

1. 建立 Session 時 phase 為 Waiting，currentRound 為空。此時 state 回 `{ phase: Waiting, currentRoundId: null, target: null }`，current-target 回 `{ data: null }`，results 回 `{ data: [] }`。`SessionStateSnapshot.changedAt` 由已持久化時間推導：無 current Round 時取 Session `createdAt`；有 current Round 時，Waiting 取 Round `createdAt`、Active 取 `startedAt`、Ended 取 `endedAt`。不新增 Session 狀態時間欄位。
2. 選擇下一題或重新開題時，在 transaction 內建立新的 Waiting Round，並更新 Session.currentRoundId 與 stateVersion。
3. 教師開始時啟用目前 Waiting Round；不得在 Start 再建立另一個 Round。
4. 結束流程先由負責勝負判定的 Feature 決定是否有勝出 Submission，並將該 Submission（若有）交給共用完成交易；同一 SQLite transaction 內將 Round 設為 Ended、持久化／替換該目標 Result（若有勝者）並更新 stateVersion。沒有勝者時不建立 Result。
5. 只有上述 transaction commit 後才對 `session:{sessionId}` room 發送既有 `session:state:changed` Ended 快照。學生收到 Ended 後再呼叫既有結果查詢，必定讀到已提交的新 Result 或空清單；不新增 Socket.IO 事件。Reconnect 或重送 watch 仍取得最新 `session:state` 快照與 stateVersion。
6. Session.currentRoundId 必須指向同一 Session 的 Round。建立 Round 前須驗證題目／題組同 Session；Submission、SubmissionAnswer、Result 的跨 Session／輪次完整性依 [data-model.md](data-model.md) 的 SQLite 約束、trigger 與同交易 Domain Validation 保證。
7. 無 current Round 時，state 查詢回 Waiting/null target 快照，current-target 回 `{ data: null }`，results 回 `{ data: [] }`。End transaction commit 後才廣播 Ended，並以既有 results query 取得已持久化結果。

### Testing Strategy

- **Unit**: domain validators 的正常與異常案例、Question/Blank 0..*、非空 QuestionGroup 提交目標、Round target XOR、錯誤碼映射、ActorContext 驗證。
- **Persistence integration**: SQLite scoped composite foreign keys、same-Session triggers、unique (teamId, roundId)、Question 零 Blank、空題組目標拒絕、Round 目標二擇一、SubmissionAnswer 目標 Blank、Result winner 同 Round、Ended/Result 同交易原子性。
- **API integration**: Supertest 驗證 pre-join Activity Code lookup 可在無 Participant ActorContext 時執行、只回必要摘要並超限回 429；受保護 API 的 Unauthorized／Forbidden；Waiting 教師預覽、Waiting/Ended 學生拒絕、Active 學生讀取；no-Round state/current-target/results 行為；以及 response envelope 與偽造身分不可繞過後端授權。
- **Realtime integration**: 兩個 client 訂閱同 session，start/end/next/reopen 事件均更新；驗證未授權 watch 收到錯誤且未加入 room；量測正常連線下 ≤2 秒；重新連線後取得最新快照，不重播成過時狀態。
- **Manual**: 五個 Route、placeholder 邊界、視窗重新載入、老師及兩個學生組別對同一狀態的一致呈現。核心業務行為由後續 Feature 驗收。

### Constitution Check (Post-Design)

- **PASS**: one application, modular boundaries, shared TS contracts, no business implementations from excluded scope.
- **PASS**: no hard-coded question count, blank count, answers, or worksheet positions; Blank multiplicity is 0..*.
- **PASS**: backend-authoritative identity and authorization boundary; secrets stay outside source and logs.
- **PASS**: Unit/API/integration/realtime/manual validation planned; 2-second status criterion is measurable.
- **PASS**: updated diagrams represent the proposed client/server/shared package architecture and the lifecycle/relationship rules.
- **PASS**: 專案整合分支與 Constitution §III 均採用 `master`；本次僅同步文件，未執行 Git 操作。

## Complexity Tracking

No outstanding Constitution mismatch remains. Three runtime packages are the minimum needed to keep a single frontend, shared backend, and reusable types separate while both members work in one repository.
