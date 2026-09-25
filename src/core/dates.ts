/** Date-range extraction for resumes and LinkedIn exports. */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

export interface DateRange {
  raw: string;
  start: Date;
  end: Date;
  current: boolean;
  /** Text on the same line with the dates removed — usually title/company. */
  context: string;
  lineIndex: number;
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const POINT = `(?:${MONTH}\\s*,?\\s*\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}|\\d{4})`;
const END = `(?:${POINT}|present|current|now|today|ongoing)`;
const RANGE_RE = new RegExp(`(${POINT})\\s*(?:-|–|—|to|until|through)\\s*(${END})`, "gi");

function parsePoint(s: string, now: Date): { date: Date; current: boolean } | null {
  const t = s.trim().toLowerCase();
  if (/present|current|now|today|ongoing/.test(t)) return { date: now, current: true };
  let m = t.match(/^([a-z]+)\.?\s*,?\s*(\d{4})$/);
  if (m) {
    const mo = MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)];
    if (mo !== undefined) return { date: new Date(Number(m[2]), mo, 1), current: false };
  }
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { date: new Date(Number(m[2]), Number(m[1]) - 1, 1), current: false };
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return { date: new Date(Number(m[1]), Number(m[2]) - 1, 1), current: false };
  m = t.match(/^(\d{4})$/);
  if (m) return { date: new Date(Number(m[1]), 0, 1), current: false };
  return null;
}

export function extractDateRanges(text: string, now = new Date()): DateRange[] {
  const out: DateRange[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, lineIndex) => {
    RANGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RANGE_RE.exec(line)) !== null) {
      const a = parsePoint(m[1], now);
      const b = parsePoint(m[2], now);
      if (!a || !b || b.date < a.date) continue;
      const year = a.date.getFullYear();
      if (year < 1960 || year > now.getFullYear() + 6) continue;
      let context = line.replace(m[0], " ").replace(/[|•·,()\-–—]+/g, " ").replace(/\s+/g, " ").trim();
      // Title/company is often on the line above the dates.
      if (context.length < 3 && lineIndex > 0) context = lines[lineIndex - 1].trim();
      out.push({ raw: m[0], start: a.date, end: b.date, current: b.current, context, lineIndex });
    }
  });
  return out;
}

/** Total non-overlapping months covered by the ranges. */
export function totalMonths(ranges: Pick<DateRange, "start" | "end">[]): number {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  let months = 0;
  let curStart: Date | null = null;
  let curEnd: Date | null = null;
  const diff = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  for (const r of sorted) {
    if (!curStart || !curEnd || r.start > curEnd) {
      if (curStart && curEnd) months += diff(curStart, curEnd);
      curStart = r.start;
      curEnd = r.end;
    } else if (r.end > curEnd) {
      curEnd = r.end;
    }
  }
  if (curStart && curEnd) months += diff(curStart, curEnd);
  return months;
}
