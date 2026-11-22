import { HttpError } from '../../../errors/http-error.js';

export interface SheetRef {
  readonly spreadsheetId: string;
  /** Tab gid from the URL; null = first tab. */
  readonly sheetId: number | null;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

/** Pure: `https://docs.google.com/spreadsheets/d/<id>/...` with optional gid in query or fragment (contracts/sheets-gateway.md). */
export function parseSheetUrl(raw: string): SheetRef {
  const invalid = () => new HttpError(400, 'INVALID_SHEET_URL', 'Paste the full Google Sheets URL.');
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') throw invalid();
  const match = /^\/spreadsheets\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
  if (!match || !ID_PATTERN.test(match[1])) throw invalid();

  const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('gid');
  const gid = fromHash ?? url.searchParams.get('gid');
  if (gid === null) return { spreadsheetId: match[1], sheetId: null };
  if (!/^\d{1,10}$/.test(gid)) throw invalid();
  return { spreadsheetId: match[1], sheetId: Number(gid) };
}
