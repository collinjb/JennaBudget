import type { ISODate, MonthKey } from '../types';

// All dates are LOCAL calendar dates. Never use `new Date('YYYY-MM-DD')` (parses as UTC).

/** Today's local date. `now` is injectable for tests. */
export function todayISO(now?: Date): ISODate {
  throw new Error('TODO todayISO');
}
/** Local Date -> 'YYYY-MM-DD'. */
export function toISODate(d: Date): ISODate {
  throw new Error('TODO toISODate');
}
/** 'YYYY-MM-DD' -> Date at LOCAL midnight. */
export function fromISODate(s: ISODate): Date {
  throw new Error('TODO fromISODate');
}
/** True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30). */
export function isValidISODate(s: string): boolean {
  throw new Error('TODO isValidISODate');
}
export function addDays(d: ISODate, n: number): ISODate {
  throw new Error('TODO addDays');
}
/** Add months keeping the day, clamped to month end: 2026-01-31 + 1 => 2026-02-28. */
export function addMonthsClamped(d: ISODate, n: number): ISODate {
  throw new Error('TODO addMonthsClamped');
}
/** month1 is 1..12 */
export function daysInMonth(year: number, month1: number): number {
  throw new Error('TODO daysInMonth');
}
/** Date in a month with day clamped to the month end: (2026, 2, 31) => '2026-02-28'. */
export function dateInMonth(year: number, month1: number, day: number): ISODate {
  throw new Error('TODO dateInMonth');
}
/** '2026-10-08' -> '2026-10' */
export function monthKey(d: ISODate): MonthKey {
  throw new Error('TODO monthKey');
}
export function addMonthsToKey(m: MonthKey, n: number): MonthKey {
  throw new Error('TODO addMonthsToKey');
}
/** year*12 + (month-1); handy for month arithmetic. */
export function monthIndex(m: MonthKey): number {
  throw new Error('TODO monthIndex');
}
/** Number of months from a to b (b - a). */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  throw new Error('TODO monthsBetween');
}
/** Sort comparator; ISO strings compare lexically. */
export function compareISO(a: ISODate, b: ISODate): number {
  throw new Error('TODO compareISO');
}
/** Whole days from a to b (b - a). DST-safe. */
export function diffDays(a: ISODate, b: ISODate): number {
  throw new Error('TODO diffDays');
}
/**
 * 'short'  => 'Oct 10'
 * 'weekday'=> 'Fri, Oct 10'
 * 'long'   => 'October 10, 2026'
 * 'numeric'=> '10/10/2026'
 */
export function formatDate(d: ISODate, style: 'short' | 'weekday' | 'long' | 'numeric'): string {
  throw new Error('TODO formatDate');
}
/** 'long' => 'March 2029', 'short' => 'Mar 2029', 'month' => 'March' */
export function formatMonth(m: MonthKey, style?: 'long' | 'short' | 'month'): string {
  throw new Error('TODO formatMonth');
}
/** 41 => '3 yrs 5 mo', 12 => '1 yr', 7 => '7 mo', 1 => '1 mo', 0 => 'this month'. */
export function formatDuration(months: number): string {
  throw new Error('TODO formatDuration');
}
/** 1 => '1st', 2 => '2nd', 3 => '3rd', 11 => '11th', 22 => '22nd' */
export function ordinal(n: number): string {
  throw new Error('TODO ordinal');
}
