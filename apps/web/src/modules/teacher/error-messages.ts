import type { TeacherApiErrorCode } from '@quiz/contracts';

/** One place for every Teacher error code → on-screen text (FR-021). Server `message` is never shown. */
export const TEACHER_ERROR_FALLBACK = '發生未預期的錯誤，請稍後再試。';

const MESSAGES: Record<TeacherApiErrorCode, string> = {
  UNAUTHENTICATED: '登入已過期或尚未登入，請重新登入。',
  FORBIDDEN: '這個操作未被允許，請重新整理頁面後再試。',
  INVALID_CREDENTIALS: '密碼錯誤，請重新輸入。',
  RATE_LIMITED: '登入失敗次數過多，請 15 分鐘後再試。',
  INVALID_INPUT: '輸入的資料格式不正確。',
  SESSION_NOT_FOUND: '找不到這個活動。',
  TARGET_NOT_FOUND: '找不到這個題目。',
  INVALID_PHASE: '目前的活動階段不能執行這個操作，已重新讀取最新狀態。',
  STALE_STATE: '狀態已更新，已重新讀取最新狀態，請確認後再操作。',
  NO_NEXT_TARGET: '所有題目都已開放過，沒有下一題。',
  NO_QUESTIONS: '尚未匯入題目，請先匯入 Guided Notes。',
  TARGET_NOT_ANSWERABLE: '這個題目沒有可作答的填空，不能開放搶答。',
  INVALID_SHEET_URL: '試算表網址格式不正確，請貼上 Google 試算表的完整網址。',
  SHEET_NOT_SHARED: '試算表尚未共用給系統的服務帳號，請先共用後再試。',
  SHEET_NOT_FOUND: '找不到這份試算表或指定的分頁。',
  SHEET_FORMAT_INVALID: '無法辨識試算表結構，請確認有「題號」與「作答」表頭。',
  DUPLICATE_QUESTION_NUMBER: '試算表中有重複的題號。',
  SHEETS_UNAVAILABLE: '暫時無法連線到 Google 試算表，請稍後再試。',
  SHEETS_NOT_CONFIGURED: '伺服器尚未設定 Google 服務帳號，無法使用試算表功能。',
  TEACHER_NOT_CONFIGURED: '伺服器尚未設定老師帳號，無法登入。',
  IMPORT_LOCKED: '活動已開始搶答，不能再重新匯入題目。',
  PREVIEW_CHANGED: '試算表在預覽後已被修改，請重新預覽。',
  NOT_IMPORTED: '這個活動的題目不是從試算表匯入的，無法寫回。',
  NOTHING_TO_WRITE: '目前沒有需要寫回的答案。',
  SHEET_CONFLICT: '試算表中有儲存格已被修改，這次沒有寫入任何儲存格。',
  INTERNAL_ERROR: '伺服器發生錯誤，請稍後再試。',
};

function cellsFrom(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  const cells: string[] = [];
  if (typeof details.cellA1 === 'string') cells.push(details.cellA1);
  if (Array.isArray(details.cells)) {
    for (const cell of details.cells) {
      if (cell && typeof cell === 'object' && typeof (cell as { cellA1?: unknown }).cellA1 === 'string') cells.push((cell as { cellA1: string }).cellA1);
    }
  }
  return cells.filter((cell) => /^[A-Z]{1,3}[0-9]{1,7}$/.test(cell));
}

export function teacherErrorMessage(code: string | undefined, details?: Record<string, unknown>): string {
  const message = code && code in MESSAGES ? MESSAGES[code as TeacherApiErrorCode] : TEACHER_ERROR_FALLBACK;
  const cells = cellsFrom(details);
  return cells.length > 0 ? `${message}（儲存格：${cells.join('、')}）` : message;
}
