/**
 * Pure CSV output for the activity record (research.md R10): UTF-8 BOM so Excel shows Chinese, CRLF line ends,
 * RFC 4180 quoting, and a ' prefix on cells starting with = + - @ (student-typed answers must not run as formulas).
 */
const BOM = '﻿';
const FORMULA_START = /^[=+\-@]/;

function cell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function writeCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return BOM + [header, ...rows].map((row) => `${row.map(cell).join(',')}\r\n`).join('');
}

/** UTC ISO-8601 → 'YYYY-MM-DD HH:mm:ss' in Asia/Taipei (UTC+8, no daylight saving). */
export function formatTaipeiTime(iso: string | null): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
