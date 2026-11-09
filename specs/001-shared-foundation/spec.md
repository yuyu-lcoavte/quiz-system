# Feature Specification: Shared Foundation

**Feature Branch**: `001-shared-foundation`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "建立課堂搶答系統共用基礎架構，供老師端與學生端在同一應用程式及共用資料概念上協作。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 進入共用系統 (Priority: P1)

老師與學生從同一網站入口進入各自的功能區。Foundation 提供共用首頁與路由骨架；未交付的功能頁顯示佔位內容，不執行登入、加入活動或管理操作。

**Why this priority**: 兩位組員須在同一應用程式中開發，首頁與路由骨架是後續整合的入口。

**Independent Test**: 開啟首頁並選擇老師或學生入口，確認進入對應路徑及佔位頁，且沒有執行尚未交付的業務功能。

**Acceptance Scenarios**:

1. **Given** 使用者開啟共用首頁，**When** 選擇老師入口，**Then** 導覽至老師登入入口佔位頁。
2. **Given** 使用者開啟共用首頁，**When** 選擇學生入口，**Then** 導覽至學生加入入口佔位頁。
3. **Given** 使用者直接開啟已規劃的老師或學生路徑，**When** 頁面尚未由後續 Feature 實作，**Then** 顯示對應的佔位內容。

---

### User Story 2 - 共享活動與題目概念 (Priority: P1)

老師端與學生端依共用概念理解活動、輪次、題目、填空、題組、組別、參與者、提交與結果之間的關係。Foundation 定義概念與必要關聯，不指定具體儲存欄位或技術。

**Why this priority**: 共用資料語意是兩個模組整合及後續功能互通的基礎。

**Independent Test**: 以需求案例建立一場活動，包含多個輪次、一題多個填空，以及由多道題目組成的題組；確認資料概念能分別表達兩種結構。

**Acceptance Scenarios**:

1. **Given** 一個 Question，**When** 該題有多個答案空格，**Then** 每個 Blank 都能獨立識別並隸屬該題。
2. **Given** 一個 QuestionGroup，**When** 它包含多道 Question，**Then** 題組關係能表達這些題目，且不與單題多填空混為一談。
3. **Given** 同一題目再次開放搶答，**When** 建立新一輪，**Then** 新 Round 可與舊 Round 區分。
4. **Given** 一個 Session，**When** 學生以 Activity Code 加入，**Then** Activity Code 與內部 Session ID 是不同概念。

---

### User Story 3 - 共用活動階段與模組契約 (Priority: P2)

老師端與學生端能依共同活動狀態理解目前是否等待、搶答進行中或已結束，並透過共用契約交換讀取題目與狀態、提交及讀取結果所需的資訊。Foundation 定義共用契約及伺服器端階段存取政策，不實作登入、加入、填答或提交業務流程。

**Why this priority**: 兩端必須對活動階段與跨模組交換資訊有一致理解，後續功能才能整合。

**Independent Test**: 驗證無 Round 與 Waiting／Active／Ended 的狀態及存取案例，確認老師可在 Waiting 預覽、學生在 Waiting 無法取得題目內容且在 Active 可取得；另確認既有活動代碼、結果與即時同步契約。

**Acceptance Scenarios**:

1. **Given** 活動尚未開放搶答，**When** 任一模組讀取活動狀態，**Then** 都能識別等待階段。
2. **Given** 活動進入搶答或結束，**When** 任一模組取得最新狀態，**Then** 都能識別目前階段。
3. **Given** 搶答已結束且老師選擇下一題，**When** 系統切換題目，**Then** 兩端回到等待階段，直到老師開始該題。
4. **Given** 活動切換至下一題或重新開啟題目，**When** 兩端取得更新，**Then** 都能識別目前題目及其輪次。
5. **Given** 跨模組操作發生錯誤，**When** 呼叫端接收錯誤，**Then** 能取得共同錯誤概念及可理解的錯誤訊息；具體格式於 Plan 定義。
6. **Given** 目前 Round 為 Waiting，**When** 學生以伺服器驗證的 Participant ActorContext 呼叫目前題目查詢，**Then** 後端拒絕請求且不回傳 Question 或 Blank 內容；具預覽權限的伺服器驗證教師可讀取預覽。
7. **Given** 目前 Round 為 Active，**When** 已加入活動的學生呼叫目前題目查詢，**Then** 後端允許讀取目前 Question／QuestionGroup 與動態 Blank；前端隱藏不能取代此後端檢查。

### Edge Cases

- 使用者直接進入未知路徑時，應顯示一致的未找到頁面或導回共用首頁。
- 活動代號不存在、已失效或無法取得活動資料時，呼叫端須能辨識失敗狀況；驗證規則及錯誤格式待確認。
- 活動狀態在使用者讀取期間改變時，兩端須能重新取得最新狀態；通知或輪詢方式待 Plan 決定。
- 題目沒有填空、題目尚未指派至題組，或題組包含空題目清單時，資料概念不得推導出固定題數；有效性規則待確認。
- 同一題目有多輪資料時，讀取目前輪次不得混淆歷史輪次。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 提供單一共用首頁，呈現老師與學生入口。
- **FR-002**: 系統 MUST 在同一套應用程式中提供下列共用路由：`/` 為首頁；`/teacher/login` 為教師登入入口；`/teacher/dashboard` 為教師管理入口；`/student/join` 為學生加入入口；`/student/session/:sessionId` 為學生活動頁。後四個頁面未由 Foundation 實作業務功能時僅顯示佔位內容。
- **FR-003**: 尚未交付的老師與學生頁面 MUST 僅呈現佔位內容，不執行其所屬業務功能。
- **FR-004**: 系統 MUST 定義 Session、Round、Question、Blank、QuestionGroup、Team、Participant、Submission 與 Result 的共用語意及關係。
- **FR-005**: 一個 Question MUST 能關聯零個或多個 Blank；每個 Blank MUST 能獨立區分。
- **FR-006**: 一個 QuestionGroup MUST 能關聯零個或多個 Question，以容許尚未完成的題組資料；QuestionGroup 與 Question 的關係 MUST 與單一 Question 的多個 Blank 分開表達。QuestionGroup 只有在至少關聯一個 Question 時，才可作為 Round 的有效目標。
- **FR-007**: Session MUST 具有內部識別概念；供學生加入使用的 Activity Code MUST 與該內部識別概念分開。
- **FR-008**: 每個 Round MUST 對應且僅對應一個搶答單位；搶答單位可以是單一 Question 或單一 QuestionGroup。同一題目重新開放搶答 MUST 建立新的 Round。
- **FR-009**: 系統 MUST 能表達活動等待、搶答進行中及搶答結束可查看結果等階段。老師選擇下一題或重新開啟已結束題目時建立對應 Round 並進入等待；老師按開始時啟用目前 Round。
- **FR-010**: 老師端與學生端 MUST 共用活動狀態語意，並能取得目前階段與目前題目／輪次資訊；每次活動階段變更 MUST 通知連線中的使用者，且連線正常時兩端 MUST 在 2 秒內顯示更新。
- **FR-011**: 共用介面契約 MUST 說明活動代號驗證、活動資訊與狀態讀取、目前題目及填空讀取、階段同步、組別與參與者識別、提交所需資料、結果讀取及錯誤回覆的責任與交換資訊。具體資料庫欄位、API 與 Socket.IO 事件格式留待 Plan 階段設計。
- **FR-012**: Foundation MUST 定義模組責任與共用契約的邊界，不得在本 Feature 實作教師驗證、Excel 處理、學生加入、組長判定、多人編輯、答案提交、順位判定、CSV 匯出或題組操作。
- **FR-013**: 系統 MUST 以資料關聯表達題目及填空數量，不得依賴寫死的題號、題數、填空數或 Excel 儲存格位置。
- **FR-014**: 具體資料庫欄位、儲存方式、API 格式及 Socket.IO 事件格式 MUST 留待 Plan 階段依雙方協調結果決定。
- **FR-015**: 每筆 Submission MUST 對應且僅對應一個 Team 與一個 Round；同一 Team 在同一 Round MUST 至多有一筆有效 Submission。Foundation MUST 持久化 `acceptedOrder` 並對同一 Round 強制唯一性；該值 MUST 由 Student Feature 的可信後端提交服務依實際接受順序產生，不得採用學生前端提供的值作為權威資料。Foundation 不實作學生正式填答或提交流程，亦不產生順位或決定勝者。
- **FR-016**: 同一題目重新開放時建立新 Round；新一輪完成後，新 Result MUST 覆蓋該題原有結果，不要求查詢舊結果版本。
- **FR-017**: 目前題目內容的存取 MUST 由後端依伺服器驗證的 ActorContext 與 Round 階段授權。具預覽權限的教師可在 Waiting 讀取題目；學生在 Waiting 不得透過 API 取得 Question／Blank 內容，僅在 Active 可讀取目前題目。Socket.IO 狀態快照不得包含題目內容；此規則不得只由前端隱藏實現。
- **FR-018**: `GET /sessions/by-code/{activityCode}` MUST 是加入前唯一受限制的匿名唯讀查詢，只回傳 `sessionId` 與活動階段；伺服器 MUST 驗證及正規化代碼，套用可設定的請求節流，超限回傳 HTTP 429，且不得建立成員身分或授予其他 API 權限。
- **FR-019**: Session 尚無 current Round 時，state MUST 為 Waiting 且 `currentRoundId` 與 target 為 null；`GET current-target` MUST 回 `{ "data": null }`，`GET results` MUST 回 `{ "data": [] }`。

### Key Entities

- **Session**: 一場搶答活動；具內部識別概念，與學生輸入的 Activity Code 分開。
- **Round**: 一個搶答單位的一次搶答輪次；該單位恰為一個 Question 或一個 QuestionGroup。同一題重新開放時建立新的 Round。
- **Question**: Guided Notes 中可獨立識別的題目，可包含多個 Blank。
- **Blank**: 題目中的獨立答案空格，隸屬一個 Question。
- **QuestionGroup**: 多道 Question 組成的提交單位概念，與一道 Question 內的多個 Blank 不同；可暫時沒有 Question，只有含至少一道 Question 時才可作為 Round 目標。
- **Team**: 以組別為單位參與活動的概念。
- **Participant**: 活動中的學生參與者，與其所屬 Team 關聯。
- **Submission**: 某組在某輪對應提交單位的提交紀錄；每筆紀錄恰對應一個 Team 與一個 Round，並包含由 Student Feature 可信後端提交服務依實際接受順序產生的 acceptedOrder。Foundation 負責欄位持久化與同 Round 唯一性，不產生順位、不接受學生前端提供的 acceptedOrder 作為權威資料，也不判定勝者；本 Feature 不實作提交操作。
- **Result**: 某輪完成後可供檢視的勝出結果，與 Round 及該輪勝出的 Submission 關聯。同一題重新搶答完成後，新 Result 覆蓋原結果。本 Feature 不做自動批改。
- **Activity Code**: 學生用來查找或加入活動的代碼，與 Session 內部識別概念分離。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 驗收者可從單一首頁進入老師及學生兩個路由區域，未實作頁面均顯示佔位內容，且未觸發排除在本 Feature 外的業務功能。
- **SC-002**: 100% 的資料模型驗收案例能分別表達單題多填空、多題題組、活動內多輪及提交結果與輪次的關聯。
- **SC-003**: 兩位組員使用同一份共用資料語意與介面責任說明，能辨識所有九種核心實體及其必要關聯，且無需建立第二套互不相容的系統架構。
- **SC-004**: 兩端的狀態驗收案例對等待、進行中、結束、下一題及重新開題能得到相同階段解讀；連線正常時，階段切換於 2 秒內顯示於兩端。
- **SC-005**: 驗收文件能逐項對應活動代號、活動資訊、題目與填空、狀態同步、參與者、提交、結果及錯誤回覆等八類介面責任，且不要求本 Feature 完成其業務操作。
- **SC-006**: 100% 的 Waiting 階段學生題目讀取案例均由後端拒絕且不含題目／填空內容；具預覽權限的教師能讀取預覽；Active 階段已加入活動的學生能取得目前題目，且 Socket.IO snapshot 不含題目內容。
- **SC-007**: 匿名活動代碼查詢只回傳 Session ID 與階段、不建立成員權限，且伺服器節流超限案例均回 HTTP 429；無 Round 的 state/current-target/results 查詢 100% 符合 FR-019 的回覆形狀。

## Assumptions

- 本 Feature 建立共用規格邊界與系統入口；老師端與學生端業務由後續 Feature 實作。
- 雙方已確認共用路由為 `/`、`/teacher/login`、`/teacher/dashboard`、`/student/join`、`/student/session/:sessionId`。
- 活動狀態包含等待、進行中及結束可查看結果；切換下一題或重新開題後回到等待，並由老師開始後才進入搶答中。
- 共用介面先定義責任和資訊需求；資料庫欄位、API 與 Socket.IO 事件格式留待 Plan 階段設計。
- Guided Notes 範本只作參考，其他檔案的儲存格位置可能不同。
- Foundation 不要求建立公開伺服器或指定框架。

## Clarifications

### Session 2026-11-08

- Q: 雙方是否正式採用提議的五個 Route 路徑？ → A: 是；雙方正式採用 `/`、`/teacher/login`、`/teacher/dashboard`、`/student/join`、`/student/session/:sessionId`。
- Q: 一個 Round 是否應對應一個搶答單位，而該單位可以是單一 Question 或一個 QuestionGroup？ → A: 是；每個 Round 對應單一 Question 或單一 QuestionGroup。
- Q: 老師按「下一題」後，系統應先回到等待狀態，等老師再按「開始」才開放作答嗎？ → A: 是；下一題先回到等待，老師再按開始才開放作答。
- Q: 老師重新開啟已結束的題目時，新一輪應立即開始，還是先回到等待並由老師再按「開始」？ → A: 先回到等待，由老師再按開始後才開放新 Round。
- Q: 在連線正常時，老師切換活動狀態後，老師端與學生端最遲應在多久內顯示更新？ → A: 2 秒內。
- Q: 雙方確認的共同資料概念與關聯為何？ → A: Session 代表一場活動；Round 代表一次搶答輪次，每個 Round 對應一個 Question 或一個 QuestionGroup；Question 可有多個 Blank，QuestionGroup 可有多個 Question；Submission 對應特定 Team 與 Round；重新開題建立新 Round，新 Result 覆蓋原結果。具體欄位、API 與 Socket.IO 事件格式留待 Plan。

### Session 2026-11-09

- Foundation 負責人主導定義共用 API、DTO 與 Socket.IO 契約，正式契約提供 Teacher Feature 組員介接；此記錄不代表另一位組員已逐項審閱所有契約。跨模組契約變更仍須先協調。
- 學生只能在 Active 透過後端授權取得目前題目內容；具預覽權限的教師可在 Waiting 讀取。活動代碼查詢是受限匿名唯讀入口，不授予活動成員權限。
- 無 Round 時 state 為 Waiting 且 Round／target 為 null；current-target 回 `{ data: null }`；results 回 `{ data: [] }`。
- 加入前匿名活動代碼查詢只回傳 `sessionId` 與 phase，伺服器驗證／正規化輸入並以可設定節流保護，超限回 HTTP 429；該查詢不授予成員權限。
- 本專案整合分支採用 `master`；Constitution §III 已依雙方確認及修訂程序同步為 `master`（v2.0.0）。
- 題組可暫時沒有 Question 作為未完成資料，但空題組不得成為 Round 目標。Student Feature 的可信後端提交服務依實際接受順序產生 acceptedOrder；Foundation 負責其欄位、持久化與同 Round 唯一性，不接受客戶端值作為權威資料，也不產生順位或判定勝者。

