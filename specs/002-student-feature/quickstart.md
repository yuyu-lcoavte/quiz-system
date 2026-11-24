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

## T067 真實 Teacher adapter 安全驗證（2026-11-23）

本節記錄目前已整合版本的測試結果；上方 T045 紀錄是 2026-11-21 的歷史狀態。目前工作分支為 `feature/student`，真實 Teacher Router、簽章 Cookie、Origin／CSRF、Socket resolver 與 watch authorizer 均已存在，並透過 `main.ts` → `startServer(createTeacherIntegration(...))` 組裝。

本輪只補強測試，未修改 Teacher／Student／Foundation 的正式功能、安全規則或公開契約：

| 驗證範圍 | 實際結果 |
| --- | --- |
| 有效混合 Cookie 的 Student 路徑 | 仍解析成該 Session／Team 的 Participant，可取得 Active 題目與編輯本組草稿；偽造角色或權限不提升身分，跨 Session watch／draft 操作遭拒。 |
| 連線後 Student 撤銷／過期 | 各以有／無有效 Teacher Cookie 測試，共四種組合。watch 回 `UNAUTHENTICATED`、不回快照、不加入另一活動 Room；重新握手也拒絕。真實 Teacher resolver、authorizer 及 Cookie verifier 的 call-through spy 均確認沒有 fallback 呼叫，Teacher-only 正向控制仍可正常授權。 |
| 無 `auth.sessionId` | 單有 Student Cookie 及偽造 Teacher claims 不會取得 Teacher 權限；有效 Teacher Cookie 仍須通過真實 resolver／authorizer。 |
| Teacher Cookie／Origin | 真實登入 Cookie 的簽章遭竄改或登入過期即拒絕；沿用真實整合測試的錯誤／缺少 Origin、缺少／偽造 Cookie、登出與不存在 Session 拒絕案例。 |
| Teacher watch guards | 使用真實 Cookie verifier 取得 resolver 發出的 ActorContext；驗證可信物件來源、Teacher kind、`session:watch` 與 Session 存在各自不可省略。單一 Teacher 可 watch 已存在活動，不額外引入未決的 Teacher 活動擁有權限制。 |
| 正式啟動入口 | 測試以子程序執行實際 `main.ts`，使用隔離暫存 SQLite、本機臨時 Port 與測試憑證，完成真實 Teacher 登入、活動建立、Socket watch，並確認缺少 CSRF／錯誤 Origin 的變更請求被拒絕。子程序於測試結束停止，不新增測試端點。 |

```powershell
$env:NODE_ENV = 'test'
npm.cmd test -- tests/realtime/teacher-socket.test.ts tests/realtime/student-socket-auth.test.ts tests/integration/student-end-composition.test.ts
npm.cmd run check
git diff --check
```

指定測試：**3 個檔案、33 項通過**。完整 `check`：**77 個檔案、436 項通過**，Contracts／Server／Web 與測試 TypeScript 檢查、Production Build 均成功；包含既有草稿、組長遞補、Cookie 恢復、重連及提交回歸。新增 9 項測試，並以真實 Cookie verifier 加強原有一項 watch guard 測試。保留既有 Vite 產物大於 500 kB 警告。`git diff --check` 無錯誤。

測試沒有用假 Teacher adapter 取代正式驗證；spy 僅觀察呼叫並保留原實作。啟動 smoke test 未串接外部 Google Sheets，也未執行人工瀏覽器、部署環境 HTTPS 或瀏覽器完整 Teacher End 流程。既有 Teacher 登出後不立即撤銷已加入 Socket room 的已知限制不因本輪改變。測試沿用既有設計，沒有新增圖表責任或資料流；未改動 `.puml`／PNG。

T067 已完成，解除 Converge F1 的自動化安全證據缺口。**T045、T041、T059～T061 及 T068～T071 均未自動勾選**。正式路徑 End 競爭與失敗測試為 T068；契約／交接狀態收尾為 T070，最終回歸與人工驗收仍須依各任務前置條件完成。427 項是本輪新增案例前的歷史基準，不作為 T067 通過的證據。

## T068 正式 Submit／End 競爭與失敗驗證（2026-11-23）

本輪在 `feature/student` 補強測試，未修改正式 Teacher／Student／Foundation 程式、SQLite Migration、安全規則、公開契約或套件依賴。保留 T067 的既有修改。`tests/integration/teacher-end.test.ts` 新增九項驗收案例；`tests/helpers/teacher-end-race-worker.ts` 僅在測試 Worker 且 `NODE_ENV=test` 時執行。

競爭測試使用同一個隔離暫存 SQLite 檔的兩條 writer 連線。各 Server composition 皆以正式 `createTeacherIntegration` 建立服務，並在其內部共用同一 Database instance；End 仍只使用既有 Coordinator／Foundation Port 的單一外層交易。第二條連線只是並行測試工具，不代表產品改成多 Server，也不宣稱兩個 Server 間會共享 Socket room 廣播。

Worker 在真正的提交寫入或 End 狀態寫入點以 TEMP trigger／函式通知「已持有寫鎖」，並透過 SharedArrayBuffer／Atomics 等待測試明確釋放。主測試收到訊號後才發出另一個真實 HTTP 請求；沒有用 sleep 猜測先後。測試連線的 `busy_timeout=0` 用於確定地觀察鎖衝突，不改正式設定。

| 案例 | 實際結果 |
| --- | --- |
| Submit 先持鎖 | 重疊的 Teacher End 在既有正式服務遭 `SQLITE_BUSY` 拒絕，未發布或寫入 Ended。Submit Commit 後重試 End，選出該有效提交；順位由伺服器產生，狀態版本僅增加一次。 |
| End 先持鎖 | 重疊的 Student HTTP 請求先在真實身分解析的 `last_seen` 更新遭 `SQLITE_BUSY`，未繞過驗證進入 Submission。End Commit 後重試，正式 Submission 交易重新讀取 Ended 並拒絕，沒有部分提交或錯誤草稿鎖定。T044 原有測試另涵蓋直接提交交易的取鎖競爭。 |
| 實際 Resolver／發布時機 | 正式 HTTP End 的 Resolver 在共用連線交易內執行；發布時交易已結束，另一條連線已能讀到 Ended 與 Result，再呼叫真實 Publisher；Student 投影讀取同一持久化勝者。 |
| 重複 End | 舊版本回 409 `STALE_STATE`；最新版本再次 End 回 409 `INVALID_PHASE`。Result、版本不改變，不重選勝者或發布第二次。 |
| Resolver／Result 寫入失敗 | 透過測試 fault injection 及 TEMP trigger 驗證 Rollback，保留原勝者、Active、版本與草稿狀態，不發布；移除故障後可正常提交／End。沒有替換 Teacher adapter 或另寫 Mock End transaction。 |
| 無勝者與結果隔離 | 單題／題組重開後無 Submission，舊邏輯目標 Result 清除，新投影為 `winner:null`；同 Session 其他目標及其他 Session 結果保持不變。Ended 草稿讀取遭拒，新 Round 可取得新的空白可編輯草稿。 |
| 發布失敗 | Commit 後 Publisher 拋錯會記錄錯誤，HTTP 仍回成功快照；Result 已保存，可重讀權威狀態，重複 End 不再發布。 |

```powershell
$env:NODE_ENV = 'test'
npm.cmd test -- tests/integration/teacher-end.test.ts tests/integration/student-end-race.test.ts tests/integration/student-end-composition.test.ts
npm.cmd run check
git diff --check
```

指定測試 **3 個檔案、47 項通過**；完整 `check` 為 **77 個測試檔、445 項通過**，TypeScript 與 Production Build 成功，保留既有 Vite 產物大於 500 kB 警告。`git diff --check` 通過，沒有未處理的測試 rejection。新增的競爭測試使用隔離資料庫與既有 Migration，不接觸正常開發資料庫。

T068 已完成並解除 Converge F2 的正式路徑測試缺口；本輪沒有變更既有設計／資料流，因此未改圖表。鎖衝突目前沿用既有 HTTP 500 `INTERNAL_ERROR`，本輪未修改錯誤契約或重試策略；這不是負載或長時間壓力測試。瀏覽器的忙碌錯誤提示、狀態重讀及操作恢復仍須在人工驗收記錄實際結果。

**T041、T045、T059～T061、T069～T071 保持未完成**，沒有因本輪測試而自動關閉。尚未執行新的 Windows 瀏覽器人工驗收；後續仍依原依賴進行 T070 契約核對、T071 最終回歸及 T069 人工驗收，本輪不自動繼續。

## T070 契約、交接文件與圖表核對（2026-11-23）

本輪限文件與圖表，確認分支為 `feature/student`，T067／T068 已完成。核對 Constitution、Student Spec／Plan／Research／Data Model／三份 Contracts／Traceability、本 Quickstart、三份 integration 交接文件及三張 Student 圖，並比對實際 `main.ts`、`app.ts`、Teacher integration／Router／Actor factory／Socket identity、Student Coordinator／Resolver 與 Foundation End Port。未發現不相容的 Foundation 公開 HTTP／DTO／Socket 契約或需要修改正式程式的缺陷。

修正過時的「Teacher adapter 尚未提供／End Port 待實作」狀態、內部服務參數與檔案名稱、Cookie 預設期限與錯誤說明；保留歷史驗證日期與既有責任分工。Teacher Router 內核發 scoped `round:end`，不提供共用 HTTP Teacher resolver；Teacher Socket 於 watch 驗證簽章 Cookie／Origin，再檢查可信來源、capability 與 Session 存在。Student 路徑失效仍拒絕，不 fallback。Submit 不改變 Round 階段；Next／重開先建立新 Waiting Round，明確 Start 後才 Active；End 同交易持久化 Result，Commit 後通知，發布失敗不撤銷成功快照。

三張 `diagrams/002-student-feature-{component,class,sequence}.puml` 已同步正式組裝與狀態流程。以下 CLI 成功（exit 0），對應 PNG 位於原目錄，並已逐張檢視：

```powershell
& 'C:\Program Files\Java\jdk-25\bin\java.exe' '-Djava.awt.headless=true' '-DPLANTUML_LIMIT_SIZE=16384' -jar plantuml-1.2026.9.jar './diagrams/002-student-feature-*.puml'
```

本輪起訖 SHA-256 比對 `apps/`、`packages/`、`tests/` 共 257 個檔案，完全未變更，保留原有未提交測試及 helper；未更動正式程式、測試邏輯或安全規則。Markdown code fence／本地連結、任務編號與核取狀態檢查及 `git diff --check` 通過。本輪未執行新的自動化或人工驗收；最近完整測試仍是 T068 的 **77 檔／445 項**，TypeScript／Build 成功及既有 Vite 大檔警告。

T041／T045 所要求的技術證據已由 T067／T068 覆蓋，未找到新的技術缺漏；依本輪限制，原核取方塊仍待負責人明確結案。T059 的技術核對由本次 T070 提供，也不自動勾選。T025／T026 仍為 Cancelled；沒有重新加入教師手動轉交或宣稱 OpenSpec 新審閱完成。

T071／T060 尚需在本輪文件完成後執行並記錄最終 `NODE_ENV=test; npm.cmd run check`、測試數量、Build 警告、Migration／隔離與 diff 檢查。T069／T061 另需正式 Teacher／兩組 Student 瀏覽器驗收、三次加入計時、狀態同步計時、Next／重開、單題 Demo、換組／角色交接與重連；未完成的人工紀錄及 ECONNABORTED 待觀察項目均保留。本輪不執行這兩項任務。

## T071 完整整合回歸（2026-11-23）

分支為 `feature/student`，T067／T068／T070 已完成，需求檢查表 16／16。此次僅執行既有驗證並更新紀錄，未修改正式功能、測試邏輯、密碼、環境檔或資料庫設定。

```powershell
$env:NODE_ENV = 'test'
npm.cmd run check
git diff --check
```

`NODE_ENV` 僅設定於執行命令的程序，沒有寫入 `.env`。第一次在 Codex 沙箱內執行：TypeScript 通過，Vitest 為 44 檔通過／33 檔失敗、238 項通過／207 項失敗，因測試失敗未進入 Build。Socket 案例出現 localhost `connect EACCES` 與衍生逾時；獨立最小 TCP listen/connect 測試亦回 `CONNECT EACCES`。取得沙箱外執行權限後，使用完全相同的 `NODE_ENV=test; npm.cmd run check` 重跑，沒有調整產品安全檢查或測試標準：

| 驗證 | 本輪實際結果 |
| --- | --- |
| TypeScript | Contracts 建置、Contracts／Server／Web typecheck 與 tests TypeScript 均成功。 |
| Vitest | **77 個測試檔、445 項全部通過**，0 失敗；Vitest 5.1.0，測試執行摘要 32.75 秒。此時間不包含前後 TypeScript／Build。 |
| Production Build | Contracts／Server TypeScript 產物及 Web Vite 建置成功；完整 `check` exit 0。 |
| 警告／提示 | Web JS 675.63 kB（gzip 195.50 kB），保留既有 >500 kB 警告；Vitest 提示 jsdom 建立 77 次、可改善環境啟動效能。兩者均非失敗，未為消除提示改動設定。 |
| 文件／工作區 | `git diff --check` 通過。原有未提交變更保留；本輪僅更新 Quickstart、Tasks、Traceability。 |

以下案例均包含在此次完整通過的測試集合中，沒有以舊基準替代本輪執行結果：

| 範圍 | 既有測試證據 |
| --- | --- |
| Teacher／Student 登入、Cookie、Origin／CSRF、跨 Session 授權 | `teacher-auth.test.ts`、`teacher-socket.test.ts`、`student-socket-auth.test.ts`、`student-enrollment.test.ts`、Student Cookie／identity／CSRF 測試；包括真實 Teacher integration 與 mixed Cookie 不 fallback 的 T067 案例。 |
| 作答、共同草稿、提交與鎖定 | Student draft API／realtime／persistence／web 測試、`student-submission.test.ts`、`student-submission-transaction.test.ts`；保留伺服器草稿與 acceptedOrder 權威、唯讀鎖定及隔離。 |
| End／Result、Submit–End 競爭 | `teacher-end.test.ts`、`student-end-race.test.ts`、`student-end-composition.test.ts`、`student-result.test.ts`；包含 T068 寫鎖順序、重複 End、同交易 Resolver、Rollback 不廣播、Commit 後發布與發布失敗仍成功。 |
| Next／重開與狀態恢復 | `teacher-rounds.test.ts`、`session-state.test.ts`、`student-session-state.test.ts` 及 Student 頁面測試；新 Round 先 Waiting、明確 Start、題目／草稿切換、忽略舊版本與重連。 |
| 組長遞補 | `student-leader-reconnect.test.ts` 及既有 presence／leader／UI 測試；多 Socket、最後連線離線、依序接任、Cookie 恢復不奪回已轉移角色與提交權限。 |
| Migration／SQLite 隔離 | `migrations.test.ts`、`migration-location.test.ts`、Student／Teacher migration 及資料模型測試；根目錄／Server Workspace／編譯路徑、001～006 migration、外鍵、獨立暫存資料庫與失敗回滾。未使用開發資料庫作測試目標。 |

T071 已達成本輪自動化回歸條件。T041／T045 已具備 T067／T068 與本次回歸的技術證據，可供負責人結案，但本輪不代為勾選。T060 的回歸證據由此提供，原核取狀態也不自動變更。

T069／T061 仍未執行，維持未完成：正式 Teacher／兩組 Student 瀏覽器流程、三次加入各 ≤120 秒、雙端狀態 ≤2 秒實測、Next／重開、單題 Demo、換組與角色交接、斷線恢復等須記錄實際操作與時間。未連線外部 Google Sheets 或驗證部署 HTTPS；既有 ECONNABORTED 觀察與 Teacher 登出後既有 room 不立即撤銷的限制保持原紀錄。本輪不宣稱完整人工驗收或新跨組簽核通過。

### T071 結束時的工作區清單

Repository：C:\Users\yUYu\Desktop\碩士\軟體工程\專題\quiz-system。以下 21 個已追蹤修改檔與 1 個未追蹤檔均保留；其中本輪僅續寫 Quickstart／Tasks／Traceability，其餘為進入 T071 前已有的修改。程式／測試 257 檔起訖 SHA-256 相同。Node v22.15.0、npm 10.9.2。

```text
 M diagrams/002-student-feature-class.png
 M diagrams/002-student-feature-class.puml
 M diagrams/002-student-feature-component.png
 M diagrams/002-student-feature-component.puml
 M diagrams/002-student-feature-sequence.png
 M diagrams/002-student-feature-sequence.puml
 M docs/integration/student-feature-review-gate.md
 M docs/integration/student-teacher-decisions.md
 M docs/integration/teacher-foundation-integration-guide.md
 M specs/002-student-feature/contracts/internal-services.md
 M specs/002-student-feature/contracts/student-http-api.md
 M specs/002-student-feature/contracts/student-realtime.md
 M specs/002-student-feature/plan.md
 M specs/002-student-feature/quickstart.md
 M specs/002-student-feature/research.md
 M specs/002-student-feature/spec.md
 M specs/002-student-feature/tasks.md
 M specs/002-student-feature/traceability.md
 M tests/integration/student-end-composition.test.ts
 M tests/integration/teacher-end.test.ts
 M tests/realtime/teacher-socket.test.ts
?? tests/helpers/teacher-end-race-worker.ts
```

## T069 Windows 瀏覽器部分驗收（2026-11-23）

**T069／T061 未完成，維持 `[ ]`。** 本輪以全新隔離 SQLite、僅該程序生效的驗收憑證及正式 `npm.cmd run dev` 啟動；沒有改動 `.env`、正式密碼設定、正式資料庫或應用程式。現有 hash-password CLI 可產生正確格式，正式老師登入成功，從老師 UI 建立 DDR6VR；兩個獨立 Cookie 學生加入，Waiting／連線正常。唯一組長可直接移至空組，原組之後的新加入者成為組長。

從送出有效活動代號至觀察到身分／組別的計時上限為 **11.702 秒、8.912 秒**（包含操作工具間隔，不是純網路延遲）。第三次未測。準備第三個獨立 Windows Chrome 視窗時，Computer Use 因無法可靠確認當前網址而停止；未繞過限制。Active、草稿／提交、End／結果、Next／重開、單題／題組、多分頁／F5／離線遞補與雙端 ≤2 秒計時沒有本輪新證據。

新建活動的 Google Sheets 匯入另因驗收環境未設 Service Account 而受阻；官方 Seed WTKARZ 雖已準備，沒有在工具中止前從 UI 開題，不能算搶答通過。本輪未使用他人金鑰。驗收程序已停止、短期明文測試憑證檔已移除，隔離 SQLite 留供檢視。沒有重跑或引用單元測試作瀏覽器 PASS，最新完整自動化仍是 T071 的 77 檔／445 項。

逐項 PASS／BLOCKED／NOT TESTED、計時方法與完整密碼設定及後續操作步驟，見 [Windows 人工驗收紀錄 T069](../../tests/manual/student-feature.md)。未觀察到可定性的產品 FAIL，但這不代表尚未執行的功能正常。T069 尚缺第三次新身分加入計時、正式 Teacher／兩組 Student 完整流程、必要角色／重連案例與狀態同步實測；T061 原依賴的核取結案也未代為處理。
