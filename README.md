# 課堂搶答系統

國立中央大學｜軟體工程期末專題

這套系統把原本由學生上台將 Guided Notes 答案填到黑板上的流程搬到網頁。老師可用原有的 Google 試算表出題，學生在同組的作答區一起填答，由組長代表小組提交。搶答結束後，系統公布最早有效提交的組別，老師可將勝出答案寫回試算表。

第一次試用可以從[本機示範](#本機示範)開始。示範活動已內建兩組及單題、題組，可直接體驗開題、作答、結算和匯出紀錄。

## 使用方式

| 階段 | 老師端 | 學生端 |
| --- | --- | --- |
| 準備活動 | 登入後建立活動，設定組數，匯入 Guided Notes，將活動代號提供給學生。 | 輸入活動代號與顯示名稱，選擇組別。等待老師開題時可換組。 |
| 開始搶答 | 選擇單題或題組，按「開始搶答」，查看各組的提交狀況。 | 同組成員可一起編輯草稿，畫面會同步本組的答案。所有空格填完後，由組長代表提交。 |
| 結算 | 按「結束搶答」，查看提交順序、各組答案和勝出結果。可重開同一題、匯出 CSV，或將勝出答案寫回原試算表。 | 查看本輪公布的勝出組別及答案。 |

### 搶答規則

- 每組每輪可提交一次，送出後答案會鎖定。題組的所有空格須一起提交，共用同一個搶答順位。
- 順位依伺服器接受有效提交的順序決定。最早提交的組別勝出，系統不自動判斷答案正誤。
- 組長的所有連線中斷後，系統會依加入順序將組長資格交給下一位在線組員。
- 重開同一題會建立新的一輪，最新結算結果會取代該題原先公布的結果。CSV 仍會保留歷次紀錄。

## 本機示範

### 1. 安裝並設定老師登入

建議使用 **Node.js 22.x（22.12.0 以上）**及隨附的 npm。請在專案根目錄執行下列指令。Windows PowerShell 若限制執行 `npm`，可改用 `npm.cmd`。

```bash
npm ci
```

複製 `.env.example` 為 `.env`。Windows PowerShell 可執行 `Copy-Item .env.example .env`，macOS 或 Linux 可執行 `cp .env.example .env`。

```bash
npm run teacher:hash-password
```

依提示輸入想使用的老師登入密碼，把終端機輸出的雜湊貼到 `.env` 的 `TEACHER_PASSWORD_HASH`。之後登入時使用原始密碼。

執行以下指令兩次，將兩組不同的值分別填入 `TEACHER_SESSION_SECRET` 與 `STUDENT_CSRF_SECRET`。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

試跑示範活動時，`GOOGLE_SERVICE_ACCOUNT_KEY_FILE` 可留空，其餘設定可沿用 `.env.example`。請將 `.env` 保留在本機。

### 2. 建立示範活動並啟動

```bash
npm run teacher:seed-demo
npm run dev
```

先記下第一個指令印出的**活動代號**。第二個指令會啟動前端（`5173`）與後端（`3000`）。

| 網頁入口 | 網址 |
| --- | --- |
| 首頁 | [http://127.0.0.1:5173](http://127.0.0.1:5173) |
| 老師登入 | [http://127.0.0.1:5173/teacher/login](http://127.0.0.1:5173/teacher/login) |
| 學生加入 | [http://127.0.0.1:5173/student/join](http://127.0.0.1:5173/student/join) |

### 3. 試跑並確認結果

1. 老師登入後，從活動清單開啟示範活動。用兩個獨立的瀏覽器設定檔，或兩種不同的瀏覽器開啟學生加入頁，避免兩位學生共用同一個身分。
2. 兩位學生輸入相同的活動代號，分別加入第 1 組與第 2 組。老師選擇第 3 題（單題）或第 1 題（題組），按「開始搶答」，確認兩組都看到題目。
3. 讓第 2 組先填完並提交，再讓第 1 組提交。老師按「結束搶答」後，確認學生端公布第 2 組勝出，老師端可查看兩組的提交順序。
4. 按「匯出 CSV」，確認檔案中有兩組的作答紀錄。

## 使用自己的 Guided Notes

1. 在 Google Cloud 啟用 Google Sheets API 並建立服務帳戶。將 JSON 金鑰存到專案目錄外，在 `.env` 的 `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` 填入絕對路徑。若系統已啟動，請重啟後端。
2. 將 [Guided Notes 範例](docs/examples/)中的單題或題組檔案轉為 Google 試算表。將試算表分享給服務帳戶。若要寫回答案，請給予「編輯者」權限。
3. 在老師端建立新活動，貼上要使用的分頁網址。預覽題號與填空位置後，按「確認匯入」。
4. 完成搶答並結算後，按「寫回 Guided Notes」，確認預覽中的答案與儲存格，再執行寫回。

寫回功能使用活動匯入時記錄的試算表和填空位置，因此本機示範活動僅提供搶答和匯出 CSV。

## 專案與驗收資料

| 資料 | 位置 |
| --- | --- |
| 學生端與老師端規格 | [學生端規格](specs/002-student-feature/spec.md) · [老師端規格](specs/003-teacher-feature/spec.md) |
| 系統設計圖（PlantUML） | [diagrams/](diagrams/) |
| 手動驗收步驟與紀錄 | [學生端](tests/manual/student-feature.md) · [老師端](tests/manual/teacher-feature.md) |
| 原始碼 | [網頁介面](apps/web/) · [後端](apps/server/) · [共用型別](packages/contracts/) |

前端使用 React、Vite 與 TypeScript。後端使用 Express 與 SQLite，並透過 Socket.IO 同步搶答狀態和組內草稿。需求與驗收條件使用 Spec Kit 管理。

若要執行型別檢查、Vitest 自動化測試與建置，請在專案根目錄執行 `npm run check`。
