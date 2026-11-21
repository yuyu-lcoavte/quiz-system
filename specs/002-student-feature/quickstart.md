# Student Feature Quickstart

在 Windows PowerShell 或 VS Code 終端機從 Repository 根目錄執行。使用 Node.js 22.12+ 和隨附的 npm。

```powershell
npm.cmd ci
npm.cmd run check
```

## 啟動隔離的瀏覽器 Demo

以下命令建立全新的暫存資料夾，讓每次從乾淨狀態開始。若要驗證重啟後的身分或草稿恢復，請在同一 PowerShell 保留 `SQLITE_PATH`、CSRF secret 與瀏覽器設定檔，直接再執行 `npm.cmd run dev`。

```powershell
npm.cmd run build --workspace @quiz/contracts
$studentDemoDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('quiz-student-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $studentDemoDirectory | Out-Null
$env:STUDENT_UI_FIXTURE_PATH = Join-Path $studentDemoDirectory 'student-ui-demo.sqlite'
$env:NODE_ENV = 'test'
node --import tsx/esm tests/fixtures/student-ui-demo.ts
if ($LASTEXITCODE -ne 0) { throw 'Student Demo fixture creation failed.' }

$env:NODE_ENV = 'development'
$env:SQLITE_PATH = $env:STUDENT_UI_FIXTURE_PATH
$env:STUDENT_ALLOWED_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173'
$env:STUDENT_CSRF_SECRET = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
npm.cmd run dev
```

開啟 `http://127.0.0.1:5173/student/join`。Vite 將 `/api` 和 `/socket.io` 轉送到 `127.0.0.1:3000` 的 Express／Socket.IO。Student Socket 透過 WebSocket 握手送出瀏覽器的 Origin 及 `student_session` Cookie。測試身分恢復時請使用同一主機名稱和瀏覽器設定檔。

| 活動代號 | 初始資料 |
| --- | --- |
| `DEMO-WAIT` | Waiting，學生畫面不顯示題目。 |
| `DEMO-SINGLE-ACTIVE` | Active，單題模式，一題、兩個 Blank。 |
| `DEMO-ACTIVE` | Active，題組模式，兩題、四個 Blank，可用不同學生身分測試同組草稿和提交。 |
| `DEMO-ENDED` | Ended，含已持久化的勝出組別及四筆答案。 |

每個代號各是一場活動。Fixture 只透過本機命令建立獨立 SQLite 檔，會拒絕覆寫既有檔案。Teacher 控制 Round及 Submit／End 競爭須另做整合驗收。操作步驟與已回報的瀏覽器觀察見 [Windows 人工驗收紀錄](../../tests/manual/student-feature.md)。

從加入頁先進入 `DEMO-SINGLE-ACTIVE`，確認只顯示一題兩格，兩格都有答案後由組長送出。再回加入頁進入 `DEMO-ACTIVE`，確認同一輪顯示兩題四格，四格填齊後一起提交一次。若先前已建立舊版 Demo，請停止開發伺服器並重新執行上方整段指令，產生含新代號的獨立資料庫。

## 指定自動化測試

```powershell
npm.cmd test -- tests/api/student-join-options.test.ts tests/api/student-csrf.test.ts tests/api/student-identity.test.ts tests/integration/student-enrollment.test.ts tests/integration/student-leader-reconnect.test.ts tests/integration/student-team-change.test.ts
npm.cmd test -- tests/integration/student-vite-proxy.test.ts tests/realtime/student-socket-auth.test.ts tests/realtime/student-draft.test.ts tests/integration/student-draft-persistence.test.ts
npm.cmd test -- tests/api/student-submission.test.ts tests/integration/student-submission-transaction.test.ts tests/api/student-result.test.ts tests/unit/student-winner-resolver.test.ts
npm.cmd test -- tests/web/student-join-pages.test.tsx tests/web/student-activity-draft.test.tsx tests/web/student-result-state.test.tsx tests/web/student-session-state.test.ts
npm.cmd test -- tests/integration/migrations.test.ts tests/integration/migration-location.test.ts tests/persistence/student-migration.test.ts tests/persistence/student-repositories.test.ts tests/integration/student-submission-transaction.test.ts tests/unit/student-winner-resolver.test.ts
```

自動化套件透過隔離測試資料或資料庫驗證；需求對應見 [追蹤表](traceability.md)。

## 本次自動化驗證紀錄

| 檢查 | 實際結果 |
| --- | --- |
| `npm.cmd run check` | Exit 0。Contracts、Server、Web 與測試 TypeScript 檢查通過；三個工作區的 Build 通過，包含 Vite production build。 |
| Vitest | 44 個測試檔、173 項全部通過。包含 Foundation API、SQLite／Migration、Session Watch／State 與原有路由，以及 Student 測試。 |
| Migration 與交易指定測試 | 6 個測試檔、21 項全部通過。涵蓋 Migration 路徑解析、Student 增量 Schema、組長資料約束、SQLite 寫鎖與同步 Winner Resolver。 |
| Demo 資料準備 | 已執行 Quickstart 的 fixture 命令，成功在暫存目錄建立三個 Demo Session 的 SQLite 檔。 |

上述是遞補前基準。2026-11-14 T062～T066 的 `npm.cmd run check` 已通過，TypeScript、Production Build 與 Vitest 均成功，共 44 個檔案、179 項測試。包含既有回歸，以及新 migration 回填、多連線遞補、撤銷憑證、回滾、提交兩種交易順序與過期身分回應。

T066 已以隔離 Demo 實測兩個 Cookie 身分、多分頁、F5、無候選及新組員上線後遞補，另確認新任組長提交後兩端草稿鎖定。Vite 再度記錄 `ECONNABORTED`，本次已驗收操作均完成。T060 最終整合檢查與 T061 正式 Teacher／Student 驗收仍待已審閱的 Teacher 介接。[Windows 人工驗收紀錄](../../tests/manual/student-feature.md)

取消教師組長操作後，Student End 準備階段的 `npm.cmd run check` 通過，包含 TypeScript、45 個測試檔的 187 項 Vitest 測試及 Production Build。新增的 End 測試使用測試專用 port、同一筆外層 SQLite 寫入交易及現有 Foundation 持久化程式，驗證兩種取鎖順序、結果讀取、回滾與通知時機。T041、T045 須在 T044 正式 callback 與 Teacher 接線後完成驗證。

## T044 Foundation End Port 驗證（2026-11-20）

`SessionLifecycleService.endRoundWithWinnerResolver(input, resolver)` 現在提供正式同步 Foundation Port。命令型別 `FoundationLifecycleEndInput` 與 `WinnerResolver` 定義於 `foundation-transactions.ts`，Port 介面定義於 `session-lifecycle-service.ts`。

交易先取得外層 `BEGIN IMMEDIATE` 寫鎖，檢查 Session、Round 所屬關係、目前 Round、Active 與預期版本，然後同步查詢勝者。既有 `endRoundWithResult` 與 Result Repository 在同一連線以 savepoint 重用持久化邏輯，最後於外層交易內讀取快照並 Commit。Commit 後呼叫 publisher；通知丟錯或回傳 rejected Promise 均記錄錯誤，End 仍回傳成功快照。拒絕以外部既存交易包裝此發布 Port，避免 savepoint 被誤認為 Commit。

`tests/integration/student-end-race.test.ts` 已移除測試專用 End transaction，改以正式 Foundation lifecycle 執行既有 Coordinator。案例涵蓋兩種 SQLite 取鎖順序、acceptedOrder 選擇、錯誤 Session／Round／版本／階段、無勝者的單題及題組舊結果清除、其他活動與題目隔離、resolver／持久化 Rollback、跨連線可見性、通知失敗及不等待通知送達。

本輪以 `NODE_ENV=test` 執行完整 `npm.cmd run check`，TypeScript、46 個測試檔的 219 項 Vitest 測試與 Production Build 全部通過。Build 有現存前端產物大於 500 kB 的 Vite 警告，建置成功。三張 Student PlantUML 已依正式 Port 更新並以 CLI 重新產生 PNG。

T044 已完成。T041、T045、T059～T061 保持未完成。T045 仍須完成 Teacher router／服務正式組裝、Student Socket 失效禁止 fallback，以及 Teacher Cookie／Origin／CSRF 與授權測試。本輪未執行 Teacher 驅動的瀏覽器驗收。

## T045 正式服務組裝與 Socket 隔離（2026-11-21）

`createHttpServer` 已將同一 Database 上的 Student Submission、Winner Resolver、Foundation lifecycle／publisher 與既有 Coordinator 正式組裝。可選 `createTeacherRouter(services)` 在依賴就緒後接入真實 Teacher Router；`startServer(TeacherIntegrationOptions)` 會轉送其 HTTP／Socket 身分與 watch 授權 adapter。介面與建立順序見 [Internal Services](contracts/internal-services.md)。預設沒有 Teacher router 或 Teacher 權限核發。

已驗證學生憑證失效／過期時，`session:watch` 回覆 `UNAUTHENTICATED`，不呼叫外部 Teacher resolver、不加入目標 Room；同時帶兩種 Cookie 也不提升身分。Student `auth.sessionId` 僅選擇驗證路徑，不提供權限。

```powershell
$env:NODE_ENV = 'test'
npm.cmd test -- tests/integration/student-end-composition.test.ts tests/realtime/student-socket-auth.test.ts
npm.cmd run check
git diff --check
```

指定測試已通過 2 個檔案、16 項測試。包括正式 Coordinator 的 End、同一交易內的勝者查詢、跨連線確認 Commit 後才發布、真實 Student Socket、startup 注入，以及受控 Teacher adapter 的 Cookie／Origin／watch 邊界。受控 adapter 僅存在測試中，沒有新增正式測試端點。

完整 `NODE_ENV=test`、`npm.cmd run check` 結果為 Exit 0：Contracts／Server／Web 及測試 TypeScript 檢查、47 個 Vitest 測試檔的 231 項測試、Production Build 全部通過。保留現存 Vite 大於 500 kB 的產物警告，建置成功。`git diff --check` 無錯誤；三張 Student `.puml` 已用 PlantUML CLI 重產 PNG 並檢視。

真實 Teacher Router、簽章 Cookie、Origin／CSRF 與 watch 授權程式尚未提供，故 **T045 保持未完成**。本輪未執行新的瀏覽器人工驗收，也未完成 T041 或 T059～T061。
