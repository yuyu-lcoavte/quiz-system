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
- Issue found: after End the 作答狀況 table still showed 「（已隱藏）」, contrary to FR-022 (answers always shown after End). Fixed the same day: MonitorPanel now always shows answers once Ended and hides the toggle; covered by two new tests in `tests/web/teacher-monitor-panel.test.tsx`. Re-checked by hand on 2026-11-23 during the US3 run: after End, 作答狀況 shows the answers directly and has no show/hide button.

## US3 — Guided Notes 匯入（Google Sheets）

Setup (once): Google Cloud project with the Google Sheets API enabled; a service account with a JSON key saved **outside** the repository; `.env` `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=<absolute path to that key>`; restart `npm.cmd run dev`. Upload both `docs/examples/*.xlsx` to Google Drive and open each as a Google Sheet (File → Save as Google Sheets). Make a copy of the question-group sheet and change its layout (see 3.4).

| # | Steps | Expected | Result |
|---|---|---|---|
| 3.1 | Teacher: create a new activity, open it, look at 匯入 Guided Notes | The service-account email and the three sharing steps are shown; no key content anywhere | Pass (2026-11-23) |
| 3.2 | Paste the question-group sheet URL **before** sharing it, press 預覽 | 「試算表尚未共用給系統的服務帳號…」 | Pass (2026-11-23) |
| 3.3 | Share the sheet with the service-account email as Editor, press 預覽 again | 分頁「學習單」・共 4 題; 1 and 2 are 題組（2 題） showing label → fill cell: G5（1）→H5、G6（2）→H6 / G8（1）→H8、G9（2）→H9; 3 and 4 單題 G11 / G13. Record the time from pressing 預覽 to the table appearing (plan goal ≤ 5 s) (updated 2026-11-23 for the Q16 fill-cell clarification) | Pass (2026-11-23 re-run with a fresh copy, new expectation): preview showed G5（1）→H5、G6（2）→H6、G8→H8、G9→H9. Earlier run: about 2 s under the old expectation |
| 3.4 | On the modified copy: insert two rows and one column above/left of the header, add a 5th question, put 「（1）＿＿（2）＿＿」 in one answer cell; preview | Numbers and cell addresses follow the new layout; the two-marker question is 單題 with two cells listed; time: about 2 s | Pass (2026-11-23) |
| 3.5 | Preview the single-question sheet | 共 6 題, all 單題, answer cells G5, G7, …, G15; time: about 2 s | Pass (2026-11-23) |
| 3.6 | Confirm the question-group import | Target list shows 1–4 with 題組/單題 and 未開放; dashboard shows 已匯入 | Pass (2026-11-23) |
| 3.7 | Before any round: import the single-question sheet into the same activity | Questions are replaced by 1–6 | Pass (2026-11-23) |
| 3.8 | Preview, then edit the sheet (e.g. add a question), then press 確認匯入 | 「試算表在預覽後已被修改，請重新預覽。」; nothing imported | Pass (2026-11-23) |
| 3.9 | Paste a wrong URL (e.g. a Google Docs link) | 「試算表網址格式不正確…」 | Pass (2026-11-23) |
| 3.10 | Remove the 作答 header text in a copy and preview | 「無法辨識試算表結構…」 | Pass (2026-11-23) |
| 3.11 | Run one round (下一題 → 開始 → 結束) on the imported activity, then try to import again | The import section says it is locked | Pass (2026-11-23) |
| 3.12 | Two students play an imported group question (both blanks) | Students see one input per blank; leader submits; Teacher monitor and results show the answers | Pass (2026-11-23) |

Notes / problems found (US3):

- 2026-11-23 run by the Teacher Feature owner against real Google Sheets: 3.1–3.12 all passed.
- Preview time (pressing 預覽 → table shown): about 2 s each for 3.3, 3.4 and 3.5 (plan goal ≤ 5 s).
- 3.4: after inserting 2 rows above and 1 column to the left, adding question 5 and the answer cell 「（1）＿＿（2）＿＿」, all cell addresses followed the new layout and question 5 was a single question with two blanks.
- 3.12: two Teams answered an imported group question; result 「（1）1111；（2）22」, winner 第2組.

## US4 — 答案寫回 Guided Notes

Use a fresh copy of the question-group Google Sheet (shared with the service account as Editor), imported into a new activity, with two student browsers.

| # | Steps | Expected | Result |
|---|---|---|---|
| 4.1 | Before any round ends, press 寫回 Guided Notes | 「目前沒有需要寫回的答案。」 | Pass (2026-11-23, re-imported fresh copy) |
| 4.2 | Play target 1 (group): 第2組 submits （1）CPU、（2）OS; end. Play target 3: 第1組 submits 42; end. Press 寫回 Guided Notes | The list shows H5 （空白）→CPU, H6 （空白）→OS, G11 （空白）→42, all 寫入; G5/G6 (（1）/（2）) are not listed; targets 2 and 4 are not listed; nothing changed in the sheet yet (updated 2026-11-23) | Pass (2026-11-23, re-imported fresh copy) |
| 4.3 | Press 確認寫入 | 「已寫入 3 格。」; in Google Sheets H5 = CPU, H6 = OS, G11 = 42; G5 （1） and G6 （2） unchanged (updated 2026-11-23) | Pass (2026-11-23, re-imported fresh copy) |
| 4.4 | Reopen target 1, 第1組 submits （1）GPU、（2）RAM, end, write back | H5 CPU→GPU, H6 OS→RAM; after confirming the sheet shows GPU / RAM in H5/H6 (replaced, not appended); G5/G6 unchanged (updated 2026-11-23) | Pass (2026-11-23, re-imported fresh copy) |
| 4.5 | Reopen target 3, end with no submission, write back | G11 42→（空白）, 還原; after confirming G11 is empty again | Pass (2026-11-23, re-imported fresh copy) |
| 4.6 | Make a new winner, press 寫回 Guided Notes, then edit one listed cell by hand in Google Sheets, then press 確認寫入 (with fill cells, edit H5 or H6) | 「試算表中有儲存格已被修改，這次沒有寫入任何儲存格。（儲存格：…）」; no listed cell changed | Pass (2026-11-23, re-imported fresh copy) |
| 4.7 | Remove the service account from the sheet's sharing, then write back | 「試算表尚未共用給系統的服務帳號…」 | Pass (2026-11-23, re-imported fresh copy) |
| 4.8 | Seeded demo activity (`teacher:seed-demo`): look for 寫回 Guided Notes | Not shown (the activity was not imported) | Pass (2026-11-23, re-imported fresh copy) |

Notes / problems found (US4):

- 2026-11-23 first run: 4.1 and 4.2 passed. 4.3 wrote G5 「（1）CPU」, G6 「（2）OS」, G11 「42」. That matched the document at the time, but in the template the group answer area spans two columns (「作答」 header G4:H4): G holds the label 「（1）」 and H is the empty fill cell. This triggered the Q16 clarification (shared requirements, spec FR-028/FR-034, parser contract) and tasks T088–T091: answers now go into the empty cell right of a single marker inside the 「作答」 range; the marker cell is unchanged; two markers in one cell or a non-empty right cell keep the old "append after marker" behaviour; restore empties the fill cell.
- 2026-11-23 re-run with a fresh copy re-imported after the fix: 3.3 and 4.1–4.8 all passed.
  - 3.3: preview showed G5（1）→H5、G6（2）→H6、G8→H8、G9→H9.
  - 4.3: H5 「CPU」, H6 「OS」, G11 「42」; G5/G6 「（1）」「（2）」 unchanged.
  - 4.4: after reopen H5/H6 were replaced by 「GPU」「RAM」, not appended.
  - 4.5: reopen with no submission restored G11 to empty.
  - 4.6: editing a listed cell by hand before confirming showed the conflict message and wrote nothing; after putting that cell back, write-back succeeded.
  - 4.7: after removing the share, write-back showed the not-shared message.
  - 4.8: the seed-demo activity has no 寫回 Guided Notes button.

## US5 — CSV 匯出

Use an activity that has a reopened target and at least one Team that did not submit in some round.

| # | Steps | Expected | Result |
|---|---|---|---|
| 5.1 | Teacher: press 匯出 CSV on the activity page | A file `activity-<活動代號>.csv` downloads | Pass (2026-11-23) |
| 5.2 | Open the file in Excel (double-click) | Chinese shows correctly; columns 題號, 第幾輪, 組別, 答案, 順位, 是否勝出, 送出時間; rows = rounds × teams | Pass (2026-11-23) |
| 5.3 | Import the file into Google Sheets (File → Import) | Same content, Chinese correct | Pass (2026-11-23) |
| 5.4 | Check a reopened target | Its rounds appear with 第幾輪 1, 2…; each round has its own winner (是) | Pass (2026-11-23) |
| 5.5 | Check a Team that did not submit | 答案, 順位, 送出時間 empty; 是否勝出 否 | Pass (2026-11-23) |
| 5.6 | Check a group question row | 答案 like 「（1）CPU；（2）OS」 | Pass (2026-11-23) |
| 5.7 | Check 送出時間 against the clock in class | Taiwan local time, `YYYY-MM-DD HH:mm:ss` | Pass (2026-11-23) |
| 5.8 | Use a **single question** (not a group): reopen a single target, have a student answer 「=1+1」 (with the leading =), end, then export. A group answer always starts with its marker 「（1）」, so it can never begin with = and does not test this | The cell shows the text `=1+1` (prefixed with '), not the number 2 | Pass (2026-11-23): single question 3 reopened, 第1組 answered 「=1+1」, the cell shows the text, not 2. A first attempt with a group answer (and no =) could not exercise the check, which led to this step wording |
| 5.9 | Student browser: open `/api/v1/teacher/sessions/<id>/export.csv` | 401, no file | Pass (2026-11-23) |

Notes / problems found (US5):

- 2026-11-23 run by the Teacher Feature owner: 5.1–5.9 all passed.
- 5.2: Excel showed Chinese correctly; 14 rows = 7 rounds × 2 Teams. 5.3: Google Sheets import showed the same content.
- 5.4: target 1 round 1 won by 第2組 and round 2 by 第1組, each with its own 「是」.
- 5.5: the non-submitting Team had empty 答案/順位/送出時間 and 「否」. 5.6: group answer 「（1）CPU；（2）OS」. 5.7: Taiwan time, e.g. 2026-11-23 15:19:39.
- 5.8: the first attempt used a group question (and omitted the =); a group answer starts with 「（1）」 and is never treated as a formula, so it could not test the guard. Step 5.8 now says to use a single question; re-done that way and passed.
- 5.9: a student browser opening the export URL got 401 and no file.
