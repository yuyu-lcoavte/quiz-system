# Teacher Feature — Manual Validation

Record actual results only. Anything not run stays "Not run". Automated runs do not count as manual results.

## Setup (once)

1. Copy `.env.example` to `.env` in the repository root (never commit `.env`).
2. Generate two random secrets, run once per secret:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Put one in `STUDENT_CSRF_SECRET` and the other in `TEACHER_SESSION_SECRET` (they must differ).
3. Generate the Teacher password hash (type the password twice; nothing is echoed):

   ```powershell
   npm.cmd run teacher:hash-password
   ```

   Paste the printed `scrypt$...` line into `TEACHER_PASSWORD_HASH`.
4. Leave `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` empty for US1/US2.
5. Seed the demo activity (prints the activity code):

   ```powershell
   npm.cmd run teacher:seed-demo
   ```

6. Start the app: `npm.cmd run dev`, then open `http://127.0.0.1:5173`.

### Browsers

Each person needs its own cookie jar, so use three separate browsers or profiles (two incognito windows of the same browser share cookies):

| Role | Browser |
|---|---|
| Teacher | Chrome (normal window) |
| 第1組 student | Chrome Incognito window |
| 第2組 student | Edge (or Firefox, or another Chrome profile) |

## US1 — 老師登入與活動控制

| # | Steps | Expected | Result |
|---|---|---|---|
| 1.1 | Teacher: open `/teacher/login`, enter a wrong password | 「密碼錯誤，請重新輸入。」; no navigation | Pass (2026-11-22) |
| 1.2 | Teacher: enter the correct password | Dashboard 「老師管理入口」; the seeded activity is listed with its code, 2 組, 等待中, 未匯入 | Pass (2026-11-22) |
| 1.3 | Teacher: create an activity with 組數 3 | Opens 活動管理 with a 6-character code and 第1組、第2組、第3組; target list says 尚未匯入題目 | Pass (2026-11-22) |
| 1.4 | Teacher: back to the list, click 管理 on the seeded activity | Targets 1 (題組 2 題), 2 (題組 2 題), 3, 4 all 未開放; 開始/結束 disabled; 下一題 enabled | Pass (2026-11-22) |
| 1.5 | Students: open `/student/join` in both student browsers, enter the seeded code, join 第1組 and 第2組 | Both see Waiting | Pass (2026-11-22) |
| 1.6 | Teacher: 下一題 | Target 1 等待中; both students show Waiting within 2 s | Pass (2026-11-22) |
| 1.7 | Teacher: 開始搶答 | Both students see question group 1 (two blanks) within 2 s | Pass (2026-11-22) |
| 1.8 | 第2組 fills both blanks and submits, then 第1組 submits | Both submissions accepted | Pass (2026-11-22) |
| 1.9 | Teacher: 結束搶答 | Both students see Ended and the result shows 第2組 as winner within 2 s | Student side Pass (2026-11-22): both Teams showed 已結束 and 第2組 as winner. Teacher-side winner display was missing in US1 (FR-024, US2 scope) → verified Pass in US2 step 2.4 (2026-11-22) |
| 1.10 | Teacher: on target 1 click 重新開題, then 開始, then 結束 without submissions | New round; target 1 roundCount 2; students see no winner | Pass (2026-11-22) |
| 1.11 | Teacher: open the same activity in a second tab, press 下一題 in tab A, then 下一題 in tab B (old version) | Tab B shows 「狀態已更新…」 and reloads the latest state; no extra round | Pass (2026-11-22) |
| 1.12 | Teacher: press F5 in the middle of a Waiting or Active round | Page restores the same code, phase and target statuses | Pass (2026-11-22) |
| 1.13 | Teacher: 下一題 until all four targets were opened, then once more | 「所有題目都已開放過，沒有下一題。」 | Pass (2026-11-22) |
| 1.14 | Teacher: 登出, then use browser Back to the session page and press any button | Redirected to `/teacher/login` | Pass (2026-11-22) |
| 1.15 | Student browser: open `http://127.0.0.1:5173/api/v1/teacher/sessions` | 401 JSON error; no Teacher data | Pass (2026-11-22) |
| 1.16 | Teacher: log in, open DevTools → Application → Cookies | `teacher_session` is HttpOnly, SameSite=Strict, Path=/, expires in 8 h | Pass (2026-11-22) |
| 1.17 | Teacher: 5 wrong passwords in a row, then the correct one | 6th attempt shows 「登入失敗次數過多…」; correct password works again after 15 minutes | Pass (2026-11-22) |

Notes / problems found:

- 2026-11-22 run by the Teacher Feature owner (Teacher in Chrome, 第1組 in Chrome Incognito, 第2組 in another browser): 16 of 17 passed.
- 1.9: not a US1 defect. The US1 session page had no results view; showing the winner and full order after End is FR-024, delivered by US2 (ResultsPanel). Students: both Teams showed 已結束 and 第2組 as winner. Teacher side verified in US2 step 2.4.

## US2 — 老師監看與結果

| # | Steps | Expected | Result |
|---|---|---|---|
| 2.1 | Teacher: open a target and 開始搶答 (seeded activity) | 作答狀況 lists 第1組、第2組 as 未送出, order —, answers empty | Pass (2026-11-22) |
| 2.2 | 第2組 submits | Within 2 s the Teacher page shows 第2組 已送出, 第 1 名, answer column 「（已隱藏）」 | Pass (2026-11-22) |
| 2.3 | Teacher presses 顯示答案, then 隱藏答案; 第1組 types in its draft without submitting | Answers appear only after 顯示答案 and hide again; 第1組's draft text never appears; 第1組 still 未送出 | Pass (2026-11-22) |
| 2.4 | (moved from US1.9) After 第2組 then 第1組 submit, Teacher presses 結束搶答 | Teacher page shows the full order (第2組 1st, 第1組 2nd), the winner 第2組 and its answers | Pass (2026-11-22) |
| 2.5 | Teacher: reopen a target, 開始, 結束 without submissions | Results show 「無勝者」 | Pass (2026-11-22) |
| 2.6 | Students during Active (DevTools → Network on a student page) | No request returns another Team's submission, order or answers | Pass (2026-11-22) |
| 2.7 | Teacher: press F5 while Active after one submission, and again after End | Monitor and results show the same data as before the refresh | Pass (2026-11-22) |

Notes / problems found (US2):

- 2026-11-22 run by the Teacher Feature owner with the same three browsers: 2.1–2.7 all passed.
- 2.4: after End the Teacher page showed the full order (第2組 1st, 第1組 2nd), winner 第2組 and its answers 「（1）1；（2）11」.
- 2.6: after 第2組 submitted, 第1組's Network panel (current-target, draft responses and Socket messages) showed only the question structure and 第1組's own draft, no data from 第2組.
- Issue found: after End the 作答狀況 table still showed 「（已隱藏）」, contrary to FR-022 (answers always shown after End). Fixed the same day: MonitorPanel now always shows answers once Ended and hides the toggle; covered by two new tests in `tests/web/teacher-monitor-panel.test.tsx`. The fix itself has not been re-checked by hand.

## US3 — Guided Notes 匯入（Google Sheets）

Setup (once): Google Cloud project with the Google Sheets API enabled; a service account with a JSON key saved **outside** the repository; `.env` `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=<absolute path to that key>`; restart `npm.cmd run dev`. Upload both `docs/examples/*.xlsx` to Google Drive and open each as a Google Sheet (File → Save as Google Sheets). Make a copy of the question-group sheet and change its layout (see 3.4).

| # | Steps | Expected | Result |
|---|---|---|---|
| 3.1 | Teacher: create a new activity, open it, look at 匯入 Guided Notes | The service-account email and the three sharing steps are shown; no key content anywhere | Not run |
| 3.2 | Paste the question-group sheet URL **before** sharing it, press 預覽 | 「試算表尚未共用給系統的服務帳號…」 | Not run |
| 3.3 | Share the sheet with the service-account email as Editor, press 預覽 again | 分頁「學習單」・共 4 題; 1 and 2 are 題組（2 題） with G5（1）、G6（2） / G8（1）、G9（2）; 3 and 4 單題 G11 / G13. Record the time from pressing 預覽 to the table appearing (plan goal ≤ 5 s): ___ s | Not run |
| 3.4 | On the modified copy: insert two rows and one column above/left of the header, add a 5th question, put 「（1）＿＿（2）＿＿」 in one answer cell; preview | Numbers and cell addresses follow the new layout; the two-marker question is 單題 with two cells listed; time: ___ s | Not run |
| 3.5 | Preview the single-question sheet | 共 6 題, all 單題, answer cells G5, G7, …, G15; time: ___ s | Not run |
| 3.6 | Confirm the question-group import | Target list shows 1–4 with 題組/單題 and 未開放; dashboard shows 已匯入 | Not run |
| 3.7 | Before any round: import the single-question sheet into the same activity | Questions are replaced by 1–6 | Not run |
| 3.8 | Preview, then edit the sheet (e.g. add a question), then press 確認匯入 | 「試算表在預覽後已被修改，請重新預覽。」; nothing imported | Not run |
| 3.9 | Paste a wrong URL (e.g. a Google Docs link) | 「試算表網址格式不正確…」 | Not run |
| 3.10 | Remove the 作答 header text in a copy and preview | 「無法辨識試算表結構…」 | Not run |
| 3.11 | Run one round (下一題 → 開始 → 結束) on the imported activity, then try to import again | The import section says it is locked | Not run |
| 3.12 | Two students play an imported group question (both blanks) | Students see one input per blank; leader submits; Teacher monitor and results show the answers | Not run |

Notes / problems found (US3):

- (not run yet)
