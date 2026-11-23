import { describe, expect, it } from 'vitest';
import { formatTaipeiTime, writeCsv } from '../../apps/server/src/modules/teacher/export/csv-writer.js';

const BOM = '﻿';

describe('CSV writer (pure)', () => {
  it('starts with a UTF-8 BOM and ends lines with CRLF', () => {
    const csv = writeCsv(['題號', '組別'], [['1', '第1組'], ['2', '第2組']]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}題號,組別\r\n1,第1組\r\n2,第2組\r\n`);
  });

  it('quotes fields with commas, quotes or line breaks (RFC 4180)', () => {
    const csv = writeCsv(['a'], [['x,y'], ['say "hi"'], ['line1\nline2'], ['plain']]);
    expect(csv).toBe(`${BOM}a\r\n"x,y"\r\n"say ""hi"""\r\n"line1\nline2"\r\nplain\r\n`);
  });

  it('prefixes cells starting with = + - @ so spreadsheets do not run them as formulas', () => {
    const csv = writeCsv(['a'], [['=SUM(A1)'], ['+1'], ['-2'], ['@x'], ['（1）=ok']]);
    expect(csv).toBe(`${BOM}a\r\n'=SUM(A1)\r\n'+1\r\n'-2\r\n'@x\r\n（1）=ok\r\n`);
  });

  it('prefixes before quoting', () => {
    expect(writeCsv(['a'], [['=1,2']])).toBe(`${BOM}a\r\n"'=1,2"\r\n`);
  });

  it('formats UTC timestamps as Asia/Taipei local time YYYY-MM-DD HH:mm:ss', () => {
    expect(formatTaipeiTime('2026-11-22T16:05:09.123Z')).toBe('2026-11-23 00:05:09');
    expect(formatTaipeiTime('2026-01-01T00:00:00.000Z')).toBe('2026-01-01 08:00:00');
    expect(formatTaipeiTime(null)).toBe('');
  });
});
