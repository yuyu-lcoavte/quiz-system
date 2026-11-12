# Student Feature Windows 人工驗收

從 Repository 根目錄依 [Quickstart](../../specs/002-student-feature/quickstart.md) 啟動隔離的 Demo SQLite、Vite 和 Express。全程使用 `http://127.0.0.1:5173`。用不同瀏覽器設定檔建立獨立學生身分，同設定檔的多個分頁會共用 Cookie。建議 A、B 加入同組，C 加入另一組，D 加入另一場活動。

## 已有的人工紀錄

| 項目 | 實際觀察 |
| --- | --- |
| Windows Chrome，`DEMO-ACTIVE` 加入 | 已觀察到加入成功，頁面取得 Session ID、學生 AAA、Team 與成員資格。 |
| 初次 Socket.IO 連線 | 當次畫面停留於等待狀態，Chrome Polling 回覆 `UNAUTHORIZED_STUDENT_ORIGIN`。後續修正已由 Vite Proxy 整合測試驗證，修正後完整瀏覽器流程仍待逐項重驗。 |
| Vite WebSocket Proxy | 曾出現一次 `ECONNABORTED`，當時學生功能正常。列為待觀察。若再發生，記錄時間、是否剛關閉分頁或中斷網路、WS 重連與操作是否受影響。 |

以下各項以實際操作結果填寫。記錄日期、Windows／瀏覽器版本、活動代號、組別、預期與實際結果；Cookie、CSRF Token 和其他憑證值須遮蔽。

## 可用隔離 Demo 驗證的流程

| 驗收項目 | 操作與預期 | 人工狀態 |
| --- | --- | --- |
| 查詢及加入 | 在 `/student/join` 先查不存在或格式錯誤的代號，確認顯示錯誤且未取得活動身分。改查 `DEMO-ACTIVE`，應只列兩個既有組別。用 A 輸入名稱加入，確認跳至 `/student/session/:sessionId` 並顯示正確 Team 和角色。乾淨資料中該組第一個成功加入者為組長。 | 有首次成功加入紀錄；錯誤與新資料組長資格待驗 |
| SC-001 計時 | 使用三個全新瀏覽器身分。從送出有效活動代號開始計時，到活動頁顯示 Team 及成員資格停止，逐次填入秒數。每次須 ≤120 秒。 | 第 1 次 __ 秒；第 2 次 __ 秒；第 3 次 __ 秒，均待測 |
| Cookie／CSRF | 在 Network／Application 檢查 `student_session` 的 `Path=/`、`HttpOnly`、`SameSite=Lax`。本機 HTTP Demo 的 Cookie 無 `Secure`，正式 HTTPS 的 `Secure` 由自動化驗證。確認首次加入請求有允許的 Origin，可無 CSRF；加入後的草稿寫入／提交帶 `X-CSRF-Token`。缺失或無效 Origin、缺失／錯誤 CSRF、已綁定重複加入等拒絕案例可對照自動化套件。 | 待驗 |
| Waiting 與 Active | 加入 `DEMO-WAIT`，確認只顯示等待、沒有題目欄位。另開 `DEMO-ACTIVE`，確認 WebSocket upgrade 後發出 `session:watch`、收到 `session:state`，而且 `current-target` 成功，畫面顯示兩題、四個 Blank。 | 修正後待重驗 |
| 晚到與轉組 | B 在 `DEMO-ACTIVE` 首次加入 A 的既有 Team，應可加入且保留 A 的組長資格。查詢同活動應恢復既有身分；頁面無轉組入口，開始後的後端拒絕由 `student-team-change` 整合測試驗證。 | 待驗 |
| 同組草稿、隔離 | A、B 在同一 Round 修改不同 Blank，再依序修改同一 Blank。兩頁應顯示最後一筆伺服器接受的值，其他格保留。C 在同 Session 不同 Team，D 在不同 Session，均不應收到 A／B 的草稿。 | 待驗 |
| 重連與身分恢復 | A 保持原瀏覽器設定檔，記錄 `/me` 的 Participant ID 與組長資格；短暫離線後恢復，再重新整理。確認相同 Participant、Team 與提交資格，草稿回到最新已保存版本。 | 待驗 |
| 提交與鎖定 | A 先留一格空白，再填完四格並等同步完成。未填齊不可提交，B 無組長提交操作。A 成功提交後，兩頁草稿都應唯讀；重新整理後仍鎖定。 | 待驗 |
| 已公布結果 | 加入預先存入結果的 `DEMO-ENDED`，確認只顯示勝出組別與四個成功答案。無勝者投影以現有 API／UI 測試驗證。 | 有勝者瀏覽器案例待驗 |
| 版面與錯誤 | 分別在手機與桌面寬度操作加入、填答及提交，確認欄位可辨識，錯誤及斷線訊息可讀。 | 待驗 |

## T004 通過後的整合驗收

1. 以正式授權的 Teacher 後端與介面建立測試活動並控制同一 Session。讓至少兩個已加入的 Student 用戶端觀察 Waiting → Active → Ended、下一題和重新開題。正常連線下，記錄每個用戶端收到新 `stateVersion` 且畫面更新的時間，須在狀態變更後 2 秒內。確認新 Round 有不同 ID，舊草稿、提交與鎖定不沿用。
2. 使用有權限的 Teacher 操作指定同一 Team 的新組長，驗證權限交接、原組長失去提交資格及新組長可提交。現有規格保留同一身分重連的組長資格，活動開始前由組長轉組須明確交接。跨 OpenSpec／Teacher 審閱待完成，無離線自動遞補行為。
3. 在 T041／T044／T045 完成後，使用隔離的兩連線測試分別控制 Submission 和 End 先取得 SQLite 寫鎖。驗證 End 勝者取自同交易讀取、無勝者時無人工補造 Result、Result 於 Ended 廣播前已提交，並核對失敗回滾不廣播。瀏覽器另驗證 Ended 前讀不到勝出答案，以及有勝者／無勝者的顯示。
4. T059 完成介面比對後，於 T061 記錄正式 Teacher 與 Student 的實際操作、三次加入時間與初始組長重連結果。Demo 的三個代號對應獨立 Session，僅供分階段畫面驗證。Teacher End、老師轉交組長及同活動切換下一輪仍待整合驗收。
