import type { ISODate, MonthKey } from '../types';

// All dates are LOCAL calendar dates. Never use `new Date('YYYY-MM-DD')` (parses as UTC).
// Internally, calendar arithmetic is done on UTC timestamps built from the date PARTS, which has no
// daylight-saving jumps, so adding days/months is always exact.

const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Build 'YYYY-MM-DD' from parts (no validation). */
export function isoFromParts(year: number, month1: number, day: number): ISODate {
  return `${pad4(year)}-${pad2(month1)}-${pad2(day)}`;
}

/** 'YYYY-MM-DD' -> numeric parts. Assumes the string is well-formed. */
export function isoParts(s: ISODate): { year: number; month: number; day: number } {
  return { year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)), day: Number(s.slice(8, 10)) };
}

/** UTC timestamp of the calendar date's parts (for DST-free arithmetic). */
function utcMs(s: ISODate): number {
  const { year, month, day } = isoParts(s);
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getTime();
}

function isoFromUtcMs(ms: number): ISODate {
  const d = new Date(ms);
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Today's local date. `now` is injectable for tests. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Local Date -> 'YYYY-MM-DD'. */
export function toISODate(d: Date): ISODate {
  return isoFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** 'YYYY-MM-DD' -> Date at LOCAL midnight. */
export function fromISODate(s: ISODate): Date {
  const { year, month, day } = isoParts(s);
  const d = new Date(2000, 0, 1, 0, 0, 0, 0);
  d.setFullYear(year, month - 1, day); // setFullYear avoids the 0..99 => 19xx quirk
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isValidISODate(s: string): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { year, month, day } = isoParts(s);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** True for 'YYYY-MM' with month 01..12. */
export function isValidMonthKey(s: string): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return false;
  const month = Number(s.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function addDays(d: ISODate, n: number): ISODate {
  return isoFromUtcMs(utcMs(d) + n * DAY_MS);
}

/** Add months keeping the day, clamped to month end: 2026-01-31 + 1 => 2026-02-28. */
export function addMonthsClamped(d: ISODate, n: number): ISODate {
  const { year, month, day } = isoParts(d);
  const idx = year * 12 + (month - 1) + n;
  const y = Math.floor(idx / 12);
  const m = idx - y * 12 + 1;
  return dateInMonth(y, m, day);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** month1 is 1..12 */
export function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) return isLeapYear(year) ? 29 : 28;
  return DAYS_IN_MONTH[month1 - 1];
}

/** Date in a month with day clamped to the month end: (2026, 2, 31) => '2026-02-28'. */
export function dateInMonth(year: number, month1: number, day: number): ISODate {
  const clamped = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(year, month1));
  return isoFromParts(year, month1, clamped);
}

/** '2026-10-08' -> '2026-10' */
export function monthKey(d: ISODate): MonthKey {
  return d.slice(0, 7);
}

/** First day of a month: '2026-10' -> '2026-10-01'. */
export function monthStart(m: MonthKey): ISODate {
  return `${m}-01`;
}

/** Inverse of monthIndex. */
export function monthFromIndex(idx: number): MonthKey {
  const y = Math.floor(idx / 12);
  const m = idx - y * 12 + 1;
  return `${pad4(y)}-${pad2(m)}`;
}

export function addMonthsToKey(m: MonthKey, n: number): MonthKey {
  return monthFromIndex(monthIndex(m) + n);
}

/** year*12 + (month-1); handy for month arithmetic. */
export function monthIndex(m: MonthKey): number {
  return Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1);
}

/** Number of months from a to b (b - a). */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  return monthIndex(b) - monthIndex(a);
}

/** Sort comparator; ISO strings compare lexically. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from a to b (b - a). DST-safe. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

/** Day of week, 0 = Sunday .. 6 = Saturday. */
export function dayOfWeek(d: ISODate): number {
  return new Date(utcMs(d)).getUTCDay();
}

// Formatters work on the date's parts as a UTC instant formatted in UTC, so the output never depends
// on the device's time zone.
const FMT_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const FMT_WEEKDAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const FMT_LONG = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const FMT_NUMERIC = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const FMT_MONTH_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const FMT_MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const FMT_MONTH_ONLY = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

/**
 * 'short'  => 'Oct 10'
 * 'weekday'=> 'Fri, Oct 10'
 * 'long'   => 'October 10, 2026'
 * 'numeric'=> '10/10/2026'
 */
export function formatDate(d: ISODate, style: 'short' | 'weekday' | 'long' | 'numeric'): string {
  if (!isValidISODate(d)) return String(d ?? ''); // never throw while rendering
  const date = new Date(utcMs(d));
  switch (style) {
    case 'short':
      return FMT_SHORT.format(date);
    case 'weekday':
      return FMT_WEEKDAY.format(date);
    case 'long':
      return FMT_LONG.format(date);
    case 'numeric':
      return FMT_NUMERIC.format(date);
  }
}

/** 'long' => 'March 2029', 'short' => 'Mar 2029', 'month' => 'March' */
export function formatMonth(m: MonthKey, style: 'long' | 'short' | 'month' = 'long'): string {
  if (!isValidMonthKey(m)) return String(m ?? ''); // never throw while rendering
  const date = new Date(utcMs(monthStart(m)));
  switch (style) {
    case 'long':
      return FMT_MONTH_LONG.format(date);
    case 'short':
      return FMT_MONTH_SHORT.format(date);
    case 'month':
      return FMT_MONTH_ONLY.format(date);
  }
}

/** 41 => '3 yrs 5 mo', 12 => '1 yr', 7 => '7 mo', 1 => '1 mo', 0 => 'this month'. */
export function formatDuration(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return 'this month';
  const total = Math.round(months);
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (rest > 0) parts.push(`${rest} mo`);
  return parts.join(' ');
}

/** 1 => '1st', 2 => '2nd', 3 => '3rd', 11 => '11th', 22 => '22nd' */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    const mod10 = abs % 10;
    if (mod10 === 1) suffix = 'st';
    else if (mod10 === 2) suffix = 'nd';
    else if (mod10 === 3) suffix = 'rd';
  }
  return `${Math.trunc(n)}${suffix}`;
}
