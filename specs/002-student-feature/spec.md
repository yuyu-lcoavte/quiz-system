# Feature Specification: Student Feature

**Feature Branch**: `feature/student`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "在既有 Shared Foundation 上建立學生端需求：學生辨識身分、以活動代號加入並選組、依老師開放的題目共同編輯答案，由有權限的組員提交，接收活動狀態並於結束後查看結果。"

## Clarifications

### Session 2026-11-10

- Q: 學生應以哪種方式建立可由伺服器驗證、並在重新整理或重新連線後恢復的活動內身分？ → A: 使用不需帳密的活動內身分；加入時由伺服器建立，並可在同一瀏覽器恢復。
- Q: 第一位成功加入的學生取得組長資格後，若該生轉組或離線，應如何確保組別只有一位可提交者？ → A: 後端以原子方式決定首位加入者；短暫離線保留組長資格，開始前轉組須明確交接，若組長無法恢復則由授權教師轉交。
- Q: 同組不同學生編輯同一個答案時，草稿應如何同步、保存與處理同格衝突？ → A: Student Feature 伺服器保存並即時共享同組草稿；同格衝突由伺服器最後接受的修改勝出；重新整理或重新連線後恢復草稿。
- Q: 單題有多個填空時，何時可以提交，且成功提交後應如何處理共用草稿？ → A: 單題的所有 Blank 都須填入非空白答案；成功提交後，同組共用草稿與欄位轉為唯讀，不得再修改或重送。
- Q: Round 結束後，學生端應顯示哪些已公布的搶答結果？ → A: 僅顯示勝出組別名稱及該組成功提交的答案，不顯示其他組別的提交內容。
- Q: Teacher 結束一輪時，應由哪個 Feature 依後端接受順序選出勝者，並提供學生結果頁所需的勝出組別與答案？ → A: Student Feature 依可信伺服器接受順序選出勝出 Submission 並提供 Student 專用結果投影；Teacher 結束操作呼叫 Student 的可信勝者服務，再將結果交給 Foundation 既有原子 End／Result 交易，不變更 Foundation 對外契約。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 加入一場搶答活動 (Priority: P1)

學生輸入活動代號，確認活動存在及目前階段，再選擇組別並加入活動。活動代號查詢只是加入前的有限度唯讀查詢，不會自行建立學生身分或組別成員資格。學生進入活動後，後續操作須由伺服器驗證的參與者身分與組別關係授權。

**Why this priority**: 若學生無法安全地加入活動並建立可供後續操作驗證的組別關係，就無法作答或提交。

**Independent Test**: 使用有效與無效活動代號，確認學生能辨識活動、檢視可加入組別並完成加入；確認未加入者不能讀取受保護的題目或活動資料，且用戶端不能偽造組別或參與者權限。

**Acceptance Scenarios**:

1. **Given** 學生尚未加入活動，**When** 輸入有效活動代號，**Then** 系統顯示必要的活動摘要與階段，且不因此授予活動成員權限。
2. **Given** 學生輸入無效或不存在的活動代號，**When** 查詢活動，**Then** 顯示可理解的錯誤，且不洩漏其他活動或組別資料。
3. **Given** 活動存在且可供加入，**When** 學生選擇一個組別並完成加入，**Then** 後端建立或確認參與者與該組的關係，之後的活動操作以此可信關係授權。
4. **Given** 查詢端超過活動代號入口的伺服器限制，**When** 學生繼續查詢，**Then** 系統呈現受限制的回覆，不建立成員身分。

### User Story 2 - 以組別共同準備並提交答案 (Priority: P1)

搶答開始後，組員依目前 Round 的目標編輯答案。單題的多個 Blank 是同一道 Question 的多個答案欄位；QuestionGroup 則是多道 Question 組成、需一起提交的搶答單位。只有該組具有提交權限的學生可以成功送出；伺服器驗證身分、組別、Round 階段及答案後，記錄該組在該輪唯一有效的提交。

**Why this priority**: 依組別作答、只有組長送出及以後端接受順序判定搶答先後，是課堂搶答的核心學生流程。

**Independent Test**: 建立含多個 Blank 的單題及含多道 Question 的題組，讓同組成員編輯答案；確認只有後端授權的組長能提交、空白答案與非 Active 階段提交會被拒絕，且同一 Team／Round 不會接受第二筆提交。

**Acceptance Scenarios**:

1. **Given** Round 尚未進入 Active，**When** 學生開啟活動頁，**Then** 可看到等待狀態，但無法取得尚未開放的 Question 或 Blank 內容。
2. **Given** Round 進入 Active，**When** 已加入學生讀取目前目標，**Then** 顯示老師端提供的題目資料及依實際 Blank 數量產生的答案欄位。
3. **Given** 目前目標是一道含多個 Blank 的 Question，**When** 學生輸入答案，**Then** 每個 Blank 的答案可獨立編輯，且不被當成多題 QuestionGroup。
4. **Given** 目前目標是有效 QuestionGroup，**When** 組員填寫題組內容，**Then** 題組內多道 Question 的答案隸屬同一 Round 與同一次提交；所有題目須完成後才可提交。
5. **Given** 參與者不具有該組的提交權限，或提供偽造的 Team、Participant、角色或 acceptedOrder，**When** 嘗試提交，**Then** 伺服器拒絕或忽略偽造資料，並只依伺服器驗證的 ActorContext 決定提交資格與所屬 Team。
6. **Given** 同組已在同一 Round 成功提交，**When** 該組任一成員再次提交，**Then** 不建立第二筆有效 Submission；成功提交前可編輯答案。
7. **Given** 提交答案只有空字串或空白字元，**When** 學生送出，**Then** 伺服器拒絕該答案，不以用戶端時間決定順位。
8. **Given** 同一題被老師重新開啟，**When** 系統進入新 Round，**Then** 學生作答與提交以新 Round 為範圍，且不得沿用舊 Round 的提交資格或誤顯示舊結果。

### User Story 3 - 同步活動狀態並查看結果 (Priority: P1)

學生在活動頁等待老師開始、作答、等待結束，並於老師結束 Round 後查看已公布結果；結果只顯示勝出組別名稱及該組成功答案。學生收到活動階段更新；若連線中斷，重新連線後以最新活動快照恢復畫面，再依權限取得該階段可見的題目或結果。

**Why this priority**: 學生必須看到與老師一致的活動階段，且不能在結束前取得其他組的作答或已公布結果。

**Independent Test**: 讓學生端訂閱同一 Session，依序檢查 Waiting、Active、Ended 與重新連線後的狀態；確認更新符合共用同步時間要求，Waiting 不回傳題目內容，Ended 後才可讀取結果。

**Acceptance Scenarios**:

1. **Given** 活動目前為 Waiting，**When** 學生進入或重新整理活動頁，**Then** 顯示等待狀態且不取得題目內容。
2. **Given** 老師開始、結束、切換下一題或重新開題，**When** 共用活動狀態改變，**Then** 學生端收到最新階段與 Round 參照；正常連線時在 2 秒內反映狀態變更。
3. **Given** 學生在 Active 階段作答，**When** 老師結束 Round，**Then** 學生看到 Ended 狀態，且只在此後取得已公布結果。
4. **Given** 學生在連線中斷期間錯過一個或多個狀態變更，**When** 重新連線並重新訂閱，**Then** 以最新權威快照恢復，不回到過期狀態。
5. **Given** 同一 Session 的題目被重新開啟，**When** 新 Round 狀態到達，**Then** 學生看到新 Round 的等待階段，不把舊 Round 草稿或結果當成新一輪資料。

### Edge Cases

- 活動代號不存在、格式錯誤、已結束或超出匿名查詢節流限制。
- 活動尚無 Round；此時顯示等待，不顯示題目或答案欄位。
- Question 有零個 Blank；不建立空答案提交，並清楚告知目前沒有可作答欄位。
- QuestionGroup 為空或不屬於目前 Session；Foundation 不允許空題組成為有效 Round 目標，學生端不得呈現可提交的空題組。
- Participant、Team、Session、Round 或 Blank 不屬於同一活動／目前目標；後端拒絕讀取或提交。
- 同組多人同時編輯、同時提交，或在一筆 Submission 已成功後仍操作答案；同格編輯依最後由伺服器接受的修改決定，成功提交後草稿唯讀，後端拒絕修改與重複提交。
- 學生在 Waiting 時嘗試讀取目標內容、在 Ended 後嘗試提交，或在 Round 切換期間送出舊 Round 的答案。
- 連線中斷期間發生階段變更；重新連線後應以最新快照校正畫面。
- 一組在同一 Round 重複送出，或不同組別近乎同時送出；由伺服器實際接受順序及共用唯一性限制處理。
- 成功提交後，其他組的答案與作答狀況在 Ended 前不得被學生端取得。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 學生端 MUST 使用既有共用應用程式的 `/student/join` 與 `/student/session/:sessionId` 路由；不得另建前端應用程式或變更共用路由契約。
- **FR-002**: 系統 MUST 允許尚未加入活動的學生以 Activity Code 查詢活動是否存在及其必要摘要；查詢 MUST 沿用 Foundation 的匿名唯讀、伺服器驗證與節流邊界，且不得建立 Participant、Team membership 或其他受保護權限。
- **FR-003**: 系統 MUST 在活動加入流程中呈現可選組別並允許學生選擇；組別及 Participant 的建立／確認 MUST 由伺服器驗證並維持與 Session 的關聯。
- **FR-004**: 系統 MUST 依 Q02 將後端原子化接受加入的第一位 Participant 設為該組唯一組長；並行加入不得產生多位組長。組長短暫離線或以同一活動身分恢復時保留資格；活動開始前組長轉組須明確交接，若組長無法恢復則只能由授權教師轉交。提交資格 MUST 由可信後端判定，不得由客戶端傳入角色或組長宣告。
- **FR-025**: 學生 MUST 不需建立可跨活動重用的帳號或密碼；加入活動後由伺服器建立活動內 Participant 身分，並允許同一瀏覽器在重新整理或重新連線後恢復該 Participant。身分憑證的具體傳遞與保存方式留待 Plan，且不可由客戶端自稱 Participant ID 取代伺服器驗證。
- **FR-005**: 系統 MUST 依 Q03 以 Cookie 記錄相關選組資訊；在搶答尚未開始前允許變更組別，搶答開始後不得變更。Cookie 中的資料 MUST NOT 作為伺服器驗證 Participant、Team 或組長資格的唯一依據。
- **FR-006**: 系統 MUST 對缺少、格式錯誤或不存在的 Activity Code 顯示可理解錯誤；錯誤資訊不得洩漏無關 Session、Team、Participant 或答案資料。
- **FR-007**: 系統 MUST 顯示目前活動階段；尚無 Round 或目前 Round 為 Waiting 時，學生可看見等待狀態，但不得透過任何學生端操作取得 Question 或 Blank 內容。
- **FR-008**: 系統 MUST 只在目前 Round 為 Active 且 Participant 具備該 Session 成員資格時，取得並顯示該 Round 的目前目標內容；權限及階段必須由後端驗證。
- **FR-009**: 系統 MUST 依目前 Question 及 Blank 資料動態呈現答案欄位；一道 Question 的多個 Blank 必須個別輸入，不得將其視為多題 QuestionGroup。Question 數量與 Blank 數量不得寫死，學生端不得解析 Excel 或假設儲存格位置。
- **FR-010**: 系統 MUST 將 QuestionGroup 的多道 Question 視為一個共同提交目標；符合 Q18 的題組必須所有題目完成後才可共同提交，並以同一 Round／Submission 表達。
- **FR-011**: Question 或 QuestionGroup 沒有可作答 Blank 時，學生端 MUST 不允許建立空答案 Submission，並呈現可理解的不可作答提示。
- **FR-012**: 系統 MUST 依 Q02 允許同組多位學生參與答案編輯；Student Feature 伺服器 MUST 保存並即時同步該 Team／Round 的共同草稿，重新整理或重新連線後可恢復。多人編輯同一 Blank 時，以伺服器最後接受的更新為準。此草稿同步屬 Student Feature 責任，不得假定或擴充 Foundation 的活動狀態 Socket.IO 契約來傳答案。
- **FR-013**: 系統 MUST 僅允許後端驗證具有組長提交資格的 Participant 成功提交；伺服器必須由可信身分推導 Team 與 Participant，不得採用請求中自稱的角色或 Team 作為權威資料。
- **FR-014**: 系統 MUST 拒絕純空白或僅含空白字元的提交答案，並由後端驗證 Blank 屬於目前 Round 的有效 Question 或 QuestionGroup、目前 Round 為 Active，且 Participant 所屬 Team 與 Round 同一 Session。
- **FR-015**: 同一 Team 在同一 Round MUST 至多成功建立一筆有效 Submission；成功後再次提交 MUST 被拒絕。單題多個 Blank MUST 全部填入非空白答案才能提交；題組 MUST 完成所有 Question 和其可作答 Blank 後才能提交。成功提交後，伺服器 MUST 將該 Team／Round 共用草稿設為唯讀並拒絕後續修改。
- **FR-016**: `acceptedOrder` MUST 由 Student Feature 的可信伺服器端提交服務依實際接受順序產生並交由 Foundation 持久化；客戶端不得提供權威值，學生端不得以本機時鐘產生順位。
- **FR-017**: 學生端 MUST 不執行答案自動批改。Student Feature MUST 依可信伺服器接受順序選出該 Round 的勝出 Submission，並提供受授權的 Student 專用結果投影。Teacher Feature 的 End 操作 MUST 呼叫此可信勝者服務，並將其回傳的勝出 Submission（若無任何有效提交則為無勝者）交給 Foundation 既有原子 End／Result 交易；Foundation 不選勝者，且其對外契約不因本 Feature 改動。
- **FR-018**: Student Feature MUST 重用 Foundation 的 Session、Round、Question、Blank、QuestionGroup、Team、Participant、Submission、SubmissionAnswer、Result 與 ActorContext 語意，不得建立不相容的第二套資料模型或另行儲存一份權威副本。
- **FR-019**: 學生端 MUST 接收共用活動階段快照及後續變更；必須依 `stateVersion` 忽略過期資料，且在重新連線或重新訂閱後取得最新權威快照。狀態快照不得作為取得 Question／Blank 內容的替代品。
- **FR-020**: 學生端 MUST 於正常連線下在活動狀態變更後 2 秒內顯示新狀態；不得在 Ended 前顯示或提供其他 Team 的答案或作答狀況。
- **FR-021**: Round 結束前，學生端 MUST 不提供其他組別提交內容；Round Ended 後才可取得該輪已公布的結果。
- **FR-022**: Student Feature MUST 在目前 Round 為 Ended 後呈現勝出組別名稱及該組成功提交的答案；不得在 Ended 前呈現結果，亦不得向學生呈現其他組別提交的答案。Foundation `ResultView` 僅含勝出 Submission 識別；Student Feature MUST 提供 Student 專用結果投影，從已持久化結果取得勝出組別及答案，不得擴充或變更 Foundation 對外契約。
- **FR-023**: 老師重新開啟同一題或題組時，學生端 MUST 以 Foundation 提供的新 Round 作為作答範圍；新一輪結果依 Q07 覆蓋同一邏輯目標的舊結果，舊 Round 的答案不得被誤認為新一輪提交。
- **FR-024**: 學生端 MUST 以清楚且一致的方式呈現驗證失敗、未授權、階段衝突、重複提交、節流、服務錯誤及網路中斷；不得顯示機敏憑證或依賴前端狀態掩蓋後端拒絕。

### Key Entities *(include if feature involves data)*

- **Participant**: 已加入活動的學生身分；由 Student Feature 建立／確認，並由可信後端綁定到 Team。每個活動採不需跨活動帳密的活動內身分，同一瀏覽器可恢復該 Participant；具體身分憑證形式留待 Plan。
- **Team**: Session 內的組別；組員共同作答，依共同決議由第一位加入的 Participant 擔任組長。
- **Activity Code Lookup**: 加入前的有限度活動查詢；與加入後 Participant identity／Team membership 分開。
- **Round**: 一次搶答輪次及所有學生答案的範圍；重新開題使用新 Round ID。
- **Question / Blank**: 一道題目及其零個或多個可獨立輸入答案的填空格。
- **QuestionGroup**: 多道 Question 組成的共同提交目標；不是一道 Question 的多個 Blank。
- **Team Answer Draft**: 由 Student Feature 伺服器保存、按 Team 與 Round 區分並供同組成員即時共享的答案草稿；同格更新依伺服器接受順序決定目前值。該 Team 成功提交後此草稿轉為唯讀。
- **Submission / SubmissionAnswer**: Team 在特定 Round 的唯一有效提交及逐 Blank 答案；`acceptedOrder` 由可信伺服器依實際接受順序產生。
- **Result**: 已結束 Round 的公布結果；學生結果頁僅顯示勝出 Team 名稱及該 Submission 的答案，由 Student Feature 的專用結果投影組成。
- **SessionStateSnapshot**: Foundation 提供的階段、目前 Round／目標參照、版本與時間；不包含題目內容或答案。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 學生可在 2 分鐘內從輸入有效活動代號完成組別選擇並到達學生活動頁；無效代號不會建立活動成員資格。
- **SC-002**: 在所有受保護學生操作中，0 筆請求可僅憑客戶端自稱的 Participant、Team、組長或 `acceptedOrder` 權限成功。
- **SC-003**: 當一個 Active 目標有 N 個可作答 Blank 時，畫面恰有 N 個對應答案欄位；目標有零個 Blank 時，可提交欄位與提交操作均為 0。
- **SC-004**: 每個 Team／Round 最多有 1 筆成功 Submission；任何後續提交皆被拒絕，伺服器接受順序不依賴學生裝置時鐘。
- **SC-005**: 正常連線下，學生端在 2 秒內反映共用狀態變更；斷線重連後顯示的 `stateVersion` 與伺服器最新快照一致。
- **SC-006**: 100% 的 Ended 前學生讀取結果嘗試被拒絕；Ended 後學生只看到勝出 Team 名稱與該組成功答案，不看到其他組提交內容。
- **SC-007**: 題目、填空或題組數量改變時，學生端仍依收到的資料顯示所有可作答欄位，無需修改固定題數或固定填空數的產品邏輯。
- **SC-008**: 100% 的單題與題組提交只在所有應填 Blank 均有非空白答案時成功；成功提交後所有同組用戶端的草稿呈唯讀狀態，後端拒絕任何草稿修改及重複提交。

## Assumptions

- Student Feature 併入既有單一應用程式與共用後端，使用 Foundation 已核准的 Student routes；本 Feature 不新增獨立前端、Teacher 頁面或共用 Foundation 對外契約改版。
- 老師端已建立 Session、Activity Code、Team、Question、Blank 及 QuestionGroup 資料；學生端消費其處理後的結構化資料，不讀取或解析 Excel。
- 學生只能在目前 Round 為 Active 時取得題目內容及提交；等待狀態與活動階段資訊可於題目未開放時顯示。
- Q02、Q03、Q07、Q08、Q09、Q10、Q11、Q12、Q18、Q20 的已確認行為依共同需求文件為準；本規格不變更其決議。
- 沒有可作答 Blank 的題目不接受空答案 Submission。單題有多個 Blank 時各欄位獨立輸入且都必須完成；題組內所有 Question 的可作答 Blank 都必須完成。
- `Result` 的勝者依 Student Feature 可信後端所記錄的最早有效接受順序選出，不採自動批改或公平輪替；Teacher 的 End 操作將該勝出 Submission 交給 Foundation 既有交易保存，沒有有效 Submission 時不建立 Result。
- Group name、Question 顯示編號／提示及 Blank label 以 Teacher Feature 提供的共用資料為準；其匯入辨識與保留原始 `(1)`、`(2)` 等標記由 Teacher Feature 處理及確認。
- 本地或課堂 Demo 足以驗證本 Feature；不要求公開部署。

## Cross-Feature Coordination and Deferred Decisions

### Other Shared Decisions to Track in the Owning Feature

- Q15／Q18 的名稱仍需維持明確區分：一道 Question 含多個 Blank，與 QuestionGroup 含多道 Question 並共同提交。學生端行為按此結構區分，不以單一「題組」字眼混稱。
- Q16 是否保留來源 Guided Notes 的 `(1)`、`(2)` 標記，以及匯出時如何回寫，屬 Teacher 匯入／匯出決議；Student 只顯示 Teacher 提供的 Blank 資料，不解析 Excel 或推測標記語意。
- U10 題組如何從來源檔案辨識、Q13 `.xlsx` 流程是否符合助教要求，屬 Teacher Feature 與課程驗收的待確認項目；Student 僅消費已建立的 QuestionGroup。
- Q22 共用測試案例的細節待兩組協調；本規格列出學生端驗收行為，但不宣稱已取得逐項共同測試案例審閱。
- 組長無法恢復時，規則已決定由授權教師轉交；Teacher Feature 組員需確認其操作入口及權限整合方式。此協調不改變「同組唯一組長」及後端授權原則。
- Teacher Feature 組員需協調 End 操作如何呼叫 Student Feature 的可信勝者服務，再將勝出 Submission 傳入 Foundation 既有原子交易。Student result projection 為 Student-owned；不修改 Foundation 的 `ResultView` 或其他對外契約。

## Dependencies and Compatibility

- Reuse the Foundation Activity Code lookup, Session/state/current-target/results reads, common success/error envelope, verified `ActorContext`, shared entity semantics, acceptedOrder persistence boundary, lifecycle state and Socket.IO snapshot/event contract.
- Foundation already enforces no question-content access for Participants while Waiting and allows the authorized Participant to read the target in Active; Student UI must reflect but cannot replace those backend checks.
- Foundation shared routes are `/student/join` and `/student/session/:sessionId`; this Feature fills those module entry points without changing route names.
- Foundation's reserved Student responsibilities include enrollment, team selection, draft editing and answer submission. The exact Student-owned mutation and membership operations are not defined by existing Foundation read contracts and remain for a later Plan after clarification.
- Foundation `ResultView` does not carry the winning Team display name or answer rows. Student Feature provides its own authorized result projection from shared persisted data; Teacher integration calls the Student winner resolver before the existing Foundation transaction. Coordinate the internal service boundary with the Teacher Feature member; no Foundation contract change is required.

## Out of Scope

- Teacher authentication, Teacher pages, activity creation, session lifecycle commands, team administration, Guided Notes import/export or Excel parsing/writing.
- Student account administration outside this course activity, scoring or automatic answer correctness evaluation, fairness rotation, CSV export, and public deployment.
- Changing Foundation routes, shared DTO/API formats, Socket.IO event names, database schema or Foundation business behavior.
- Selecting a specific authentication technology, cookie lifetime, endpoint payload, persistence layout, realtime draft protocol or framework implementation; those belong to Clarify/Plan and must preserve existing contracts.
