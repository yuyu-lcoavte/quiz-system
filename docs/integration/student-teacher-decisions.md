# 課堂搶答系統｜Student × Teacher 跨模組設計決議

> **狀態**：需求與責任分工已定案；Student Plan 已提出內部介面草案，尚待 Teacher 組員審閱及實作驗證，不代表已逐項共同核准或已通過程式整合。
> **日期**：2026-11-10  
> **來源**：`specs/002-student-feature/spec.md` 的 Specify／Clarify 決議、既有 Foundation 能力與共同需求。  
> **對象**：老師端負責人、學生端負責人。

## 一、已確定的共同規則

| 主題 | 決議 | 主要責任 |
| --- | --- | --- |
| 學生加入 | 學生輸入活動代號及識別名稱，選擇組別；後端建立可驗證的活動內身分，無須學生帳密 | Student |
| 晚到加入 | Session 首次進入 Active 後，尚未加入者仍可首次加入已存在 Team；不建立 Team、不改變既有 Participant 的 Team，也不新增停止加入設定 | Student |
| 身分恢復 | 同一瀏覽器在有效憑證仍存在時可恢復原 Participant 與 Team；不能只信任 Cookie 中自行宣稱的 Team ID | Student |
| 組長產生 | 第一位**成功加入** Team 者由後端原子指定為唯一組長 | Student |
| 組長斷線 | 短暫離線保留組長資格，不自動換人 | Student |
| 組長轉組 | 搶答首次開始前，原組長要轉組時必須先明確完成交接；開始後不得自由換組 | Student，Teacher 視需求協助 |
| 組長無法恢復 | 由授權教師發起「指定新組長」，Student 後端驗證並原子更新 | Teacher UI／可信入口 + Student 服務 |
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

### 決議 T-01：老師端需要「組長轉交」操作

**請老師端實作**：在可信的教師操作介面顯示組別成員與現任組長，提供「指定新組長」動作，將教師身分與目標組員交給後端進行授權驗證。

**學生端實作**：安全的 Team／Participant／Leader 關係管理、原子轉交、合法性驗證、恢復後的權限結果。Student Plan 提議 capability `team:leader:transfer`；這是新的 Teacher-issued permission string，不在 Foundation 現有讀取權限中，須經 Teacher 組員審閱後由 Teacher middleware 發出。

**禁止**：由教師前端直接修改 SQLite 或以 Client 傳入的 `isLeader=true` 當作授權結果。

### 決議 T-02：老師端 End 須整合 Student 勝者服務

**請老師端實作**：教師按下 End 的正式 UI／受保護後端入口，只呼叫 `StudentTrustedEndCoordinator.endRound(input, actorContext)`；不得由前端挑選勝者。Student Plan 提議 Teacher ActorContext capability `round:end`，此為新 permission string，不是 Foundation 現有 grant。

**學生端實作**：驗證已接受的 Submission 與 `acceptedOrder`，選出有效的最早提交者，提供 Student 專用已公布結果投影。

**沿用 Foundation**：End／Result 持久化、Round 狀態、`stateVersion` 與交易後 Socket.IO 通知。

**一致性要求**：Foundation、Student Submission 與 Student winner resolver 使用同一個 `better-sqlite3` Database instance。Foundation 在單一 `BEGIN IMMEDIATE` 交易中呼叫同步 resolver、完成 End／Result／stateVersion 更新，Commit 後才廣播；不可先查勝者、稍後再 End。無 Submission 時不建立 Result，並依 Foundation 既有行為清除同邏輯目標舊結果。

### 決議 T-03：目前不擴充 Foundation 對外契約

Student 結果頁所需的組別名稱、答案明細，採 Student 專用的結果投影提供；Foundation 原有 `ResultView` 仍維持既有語意，避免更改已完成的共同契約。

## 三、Student Plan 介面草案（尚待雙方實作前審閱）

以下屬於**技術規格待定**，不是請老師端重新決定需求：

| 待補事項 | 建議由誰產出初稿 | 驗收重點 |
| --- | --- | --- |
| 教師授權組長轉交的後端服務介面／DTO／錯誤碼 | Student Plan 提議 `team:leader:transfer` capability 與內部 service；Teacher 接 UI，待共同審閱 | 不可偽造教師、跨活動、重複組長；權限變更原子且可查；此 capability 不是 Foundation 已有 grant |
| Teacher 單一 End 呼叫與交易內 Student winner callback | Student Plan 提議 `StudentTrustedEndCoordinator.endRound(...)` 與 Foundation 同連線 callback；Teacher + Foundation 負責人待共同審閱 | 結束與提交並發時結果一致、rollback 不廣播、Commit 後才推播 |
| Student 專用結果投影 API／DTO | Student Plan 已提出草案 | 只在 Ended 顯示、只提供勝者組名／答案，不外洩其他組 |
| Student 草稿事件與同步 DTO | Student Plan 已提出草案 | Team／Round 隔離、最後接受修改生效、重連恢復、不與 Foundation 事件衝突 |
| 老師端題目匯入／Guided Notes 回寫細節 | Teacher | 依共同需求處理，與 Foundation 題目結構相容 |

**跨模組整合原則**：優先在既有 Express Server 內使用可信應用服務的介面協調；若要新增 HTTP／Socket.IO 對外事件，必須先提出契約並完成雙方審查，不能任一方自行當作既有功能。

## 四、後續分工與驗證

- **Student**：Plan 文件已提出資料模型、受保護服務、草稿同步、學生結果投影及內部函式契約；Tasks 可先建立明確的跨模組審閱 Gate。Teacher/Foundation 須在相關整合實作開始前審閱新 capability 字串與單一 End transaction callback。
- **Teacher**：可開始老師登入、題目／活動操作的獨立工作，並為 T-01、T-02 預留介接位置；暫勿自行創造同名的組長／勝者服務。
- **雙方共同驗證**：首位組員同時加入的競爭、組長斷線／轉交、草稿衝突與恢復、只有組長能提交、結束和提交同時發生、雙 Client 同步、跨 Session／Team 隔離及無勝者結束。

### 給老師端組員的一句話

> 目前共同決議已由學生端統一整理：老師端需提供**授權組長轉交 UI**及**教師結束搶答入口**；組長權限與答案接受順序、勝者選取由 Student 後端負責；Round End／Result 儲存與狀態同步沿用 Foundation。實際介接函式與 DTO 會在 Student Plan 定版後補給你，不需要在老師端重做相同服務。

---

**參考**：`docs/integration/teacher-foundation-integration-guide.md`、`specs/002-student-feature/spec.md`、`specs/001-shared-foundation/contracts/`。
