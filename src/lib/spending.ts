import type { Cents, ISODate, SpendEntry, SpendingCategory } from '../types';
import { addDays, compareISO, dayOfWeek, diffDays, monthKey, monthStart, addMonthsToKey } from './dates';
import { roundDiv } from './money';

/** Weeks run Sunday to Saturday (like a US calendar). */
export const WEEK_STARTS_ON = 0;
/** Logged purchases older than this are trimmed (about 13 months). */
export const KEEP_SPEND_DAYS = 400;

/** The budget for one week of a monthly amount: monthly × 12 ÷ 52 (rounded to the cent). */
export function weeklyFromMonthly(monthly: Cents): Cents {
  return roundDiv(monthly * 12, 52);
}

/** The monthly amount the app plans with for a weekly budget: weekly × 52 ÷ 12. Round-trips with weeklyFromMonthly. */
export function monthlyFromWeekly(weekly: Cents): Cents {
  return roundDiv(weekly * 52, 12);
}

/** The Sunday on or before `day`. */
export function weekStart(day: ISODate): ISODate {
  return addDays(day, -((dayOfWeek(day) - WEEK_STARTS_ON + 7) % 7));
}

export interface PeriodRange {
  /** First day of this week or month. */
  start: ISODate;
  /** Day after the last day (exclusive). */
  end: ISODate;
  /** Days left including today. */
  daysLeft: number;
}

export function periodRange(period: SpendingCategory['period'], today: ISODate): PeriodRange {
  const start = period === 'week' ? weekStart(today) : monthStart(monthKey(today));
  const end = period === 'week' ? addDays(start, 7) : monthStart(addMonthsToKey(monthKey(today), 1));
  return { start, end, daysLeft: diffDays(today, end) };
}

/** This period's budget: the monthly amount, or its weekly share. */
export function periodBudget(category: SpendingCategory): Cents {
  return category.period === 'week' ? weeklyFromMonthly(category.monthly) : category.monthly;
}

export interface CategorySpend {
  range: PeriodRange;
  budget: Cents;
  spent: Cents;
  /** budget − spent (negative when over). */
  left: Cents;
  over: boolean;
  /** This period's purchases, newest first. */
  entries: SpendEntry[];
}

/** How a spending category is doing this week or month. */
export function categorySpend(category: SpendingCategory, log: SpendEntry[], today: ISODate): CategorySpend {
  const range = periodRange(category.period, today);
  const entries = log
    .filter((e) => e.categoryId === category.id && compareISO(e.date, range.start) >= 0 && compareISO(e.date, range.end) < 0)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => compareISO(b.e.date, a.e.date) || b.i - a.i)
    .map(({ e }) => e);
  const spent = entries.reduce((s, e) => s + Math.max(0, e.amount), 0);
  const budget = periodBudget(category);
  return { range, budget, spent, left: budget - spent, over: spent > budget, entries };
}

/** Drop purchases older than KEEP_SPEND_DAYS so the log can't grow forever. Returns the same array if nothing changes. */
export function pruneSpendLog(log: SpendEntry[], today: ISODate, keepDays: number = KEEP_SPEND_DAYS): SpendEntry[] {
  const cutoff = addDays(today, -keepDays);
  const kept = log.filter((e) => compareISO(e.date, cutoff) >= 0);
  return kept.length === log.length ? log : kept;
}
