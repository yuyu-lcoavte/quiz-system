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
- **Git 管理與 AI 操作界線**: PASS WITH FOLLOW-UP — 本工作不執行 Git 操作。憲章記錄 `main` 為共同整合分支，本次需求文字提到 `master`；需在整合前由組員統一分支名稱，這不阻礙技術設計。
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

### Data Model Summary

細節與 SQLite 約束見 [data-model.md](data-model.md)。

| Entity | 核心用途與關係 |
|---|---|
| Session | 一場活動；具內部 ID 與唯一 Activity Code；可建立時沒有 Team 或 Round；指向目前 Round（可空）。 |
| Round | 一次搶答；隸屬 Session，Question 或 QuestionGroup 二擇一；同一題可有多輪。狀態為 Waiting／Active／Ended。 |
| Question | 隸屬 Session，可有 0..* Blank；可單獨成為 Round 目標，或屬於一個 QuestionGroup。 |
| Blank | 隸屬一個 Question，以穩定 ID 與順序區分；答案另由 SubmissionAnswer 關聯保存。 |
| QuestionGroup | 隸屬 Session，包含 1..* Question；代表多題共同提交的目標。 |
| Team | 隸屬 Session，可有多個 Participant／Submission。 |
| Participant | 對應一個 Team；登入／持久身分由 Student Feature 提供。 |
| Submission | 對應且只對應一個 Team 與 Round；同組同輪唯一；後端登錄順位可排序。 |
| Result | 每輪至多一筆，指向該輪勝出 Submission；同一目標的新輪完成後，交易內移除舊 Result 並寫入新 Result。 |

### API and Realtime Contracts

契約細節見 [contracts/http-api.md](contracts/http-api.md)、[contracts/realtime.md](contracts/realtime.md) 與 [contracts/errors-and-identity.md](contracts/errors-and-identity.md)。

HTTP 使用 `/api/v1`，成功與錯誤均採 JSON。Foundation 的契約先定義查詢與型別邊界；Teacher／Student Feature 擁有開始／結束／下一題／重新開題、正式加入、提交與結果操作的業務實作。Socket.IO 以 session room 廣播 versioned phase snapshot；連線、重新連線或重新訂閱都取得伺服器最新 snapshot，不能只依賴恢復遺失事件。

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

1. 建立 Session 時 phase 為 Waiting，currentRound 為空。
2. 選擇下一題或重新開題時，在 transaction 內建立新的 Waiting Round，並更新 Session.currentRoundId 與 stateVersion。
3. 教師開始時啟用目前 Waiting Round；不得在 Start 再建立另一個 Round。
4. 教師結束時將目前 Active Round 設為 Ended。結束後可讀目前 Result。
5. 新 Round 首次產生勝出結果時，在 transaction 內刪除同一題／題組舊 Result，新增指向新 Round 與勝出 Submission 的 Result；不提供歷史 Result 查詢契約。
6. Commit 後對 `session:{sessionId}` room 發送 `session:state:changed`。若 client reconnect 或重送 watch，server 回傳 `session:state` 最新快照與 stateVersion。

### Testing Strategy

- **Unit**: domain validators、Question/Blank 0..*、Round target XOR、錯誤碼映射、ActorContext 驗證。
- **Persistence integration**: SQLite foreign keys、unique (teamId, roundId)、Question 零 Blank、Round 目標二擇一、狀態轉換 transaction、Result 替換原子性。
- **API integration**: Supertest 驗證成功 envelope、Not Found／Validation／Unauthorized／Forbidden／Conflict 錯誤與不能繞過 server authorization。
- **Realtime integration**: 兩個 client 訂閱同 session，start/end/next/reopen 事件均更新；量測正常連線下 ≤2 秒；重新連線後取得最新快照，不重播成過時狀態。
- **Manual**: 五個 Route、placeholder 邊界、視窗重新載入、老師及兩個學生組別對同一狀態的一致呈現。核心業務行為由後續 Feature 驗收。

### Constitution Check (Post-Design)

- **PASS**: one application, modular boundaries, shared TS contracts, no business implementations from excluded scope.
- **PASS**: no hard-coded question count, blank count, answers, or worksheet positions; Blank multiplicity is 0..*.
- **PASS**: backend-authoritative identity and authorization boundary; secrets stay outside source and logs.
- **PASS**: Unit/API/integration/realtime/manual validation planned; 2-second status criterion is measurable.
- **PASS**: updated diagrams represent the proposed client/server/shared package architecture and the lifecycle/relationship rules.
- **FOLLOW-UP**: integration branch name (`main` per Constitution versus `master` in the current request) must be aligned by the two members before repository integration; this plan performs no Git operation.

## Complexity Tracking

No constitution violations requiring an exception. Three runtime packages are the minimum needed to keep a single frontend, shared backend, and reusable types separate while both members work in one repository.
