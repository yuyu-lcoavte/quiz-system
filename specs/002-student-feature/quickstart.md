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
| `DEMO-ACTIVE` | Active，兩題、四個 Blank，可用不同學生身分測試同組草稿和提交。 |
| `DEMO-ENDED` | Ended，含已持久化的勝出組別及四筆答案。 |

每個代號各是一場活動。Fixture 只透過本機命令建立獨立 SQLite 檔，會拒絕覆寫既有檔案。Teacher 控制 Round及 Submit／End 競爭須另做整合驗收。操作步驟與已回報的瀏覽器觀察見 [Windows 人工驗收紀錄](../../tests/manual/student-feature.md)。

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
