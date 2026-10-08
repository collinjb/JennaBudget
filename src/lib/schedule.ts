import type { Bill, BudgetData, Cents, Debt, ISODate, Income, MonthKey } from '../types';
import {
  addDays,
  addMonthsClamped,
  addMonthsToKey,
  compareISO,
  dateInMonth,
  diffDays,
  isoParts,
  monthFromIndex,
  monthIndex,
  monthKey,
  monthStart,
} from './dates';
import { DEBT_TYPE_INFO } from './presets';

export interface PayEvent {
  date: ISODate;
  incomeId: string;
  name: string;
  amount: Cents;
}

/** All paychecks landing on the same date, merged. */
export interface PayDay {
  date: ISODate;
  amount: Cents;
  sources: PayEvent[];
}

// ---------------------------------------------------------------------------------------------
// Generic recurrence helpers (all ranges are half-open: [start, end))
// ---------------------------------------------------------------------------------------------

/** Dates every `step` days from `anchor` (both directions) inside [start, end). */
function everyNDays(anchor: ISODate, step: number, start: ISODate, end: ISODate): ISODate[] {
  if (compareISO(start, end) >= 0) return [];
  const offset = diffDays(anchor, start);
  // First k with anchor + k*step >= start.
  const k = Math.ceil(offset / step);
  const out: ISODate[] = [];
  const span = diffDays(start, end);
  const maxIterations = Math.ceil(span / step) + 1;
  let d = addDays(anchor, k * step);
  for (let i = 0; i <= maxIterations && compareISO(d, end) < 0; i++) {
    if (compareISO(d, start) >= 0) out.push(d);
    d = addDays(d, step);
  }
  return out;
}

/** Calls fn(year, month1) for each calendar month that overlaps [start, end). */
function forEachMonth(start: ISODate, end: ISODate, fn: (year: number, month1: number) => void): void {
  if (compareISO(start, end) >= 0) return;
  const first = monthIndex(monthKey(start));
  const last = monthIndex(monthKey(addDays(end, -1)));
  for (let idx = first; idx <= last; idx++) {
    const m = monthFromIndex(idx);
    fn(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
  }
}

function inRange(d: ISODate, start: ISODate, end: ISODate): boolean {
  return compareISO(d, start) >= 0 && compareISO(d, end) < 0;
}

/** Day-of-month dates (clamped to month end) inside [start, end), only in months accepted by `monthFilter`. */
function monthlyOnDay(
  day: number,
  start: ISODate,
  end: ISODate,
  monthFilter: (year: number, month1: number) => boolean = () => true,
): ISODate[] {
  const out: ISODate[] = [];
  forEachMonth(start, end, (y, m) => {
    if (!monthFilter(y, m)) return;
    const d = dateInMonth(y, m, day);
    if (inRange(d, start, end)) out.push(d);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------------------------

function incomeDates(income: Income, start: ISODate, end: ISODate): ISODate[] {
  switch (income.frequency) {
    case 'weekly':
      return everyNDays(income.payDate, 7, start, end);
    case 'biweekly':
      return everyNDays(income.payDate, 14, start, end);
    case 'monthly':
      return monthlyOnDay(isoParts(income.payDate).day, start, end);
    case 'semimonthly': {
      const days = [...(income.semimonthlyDays ?? [1, 15])].sort((a, b) => a - b);
      const out: ISODate[] = [];
      forEachMonth(start, end, (y, m) => {
        for (const day of days) {
          // 31 (or anything past the month end) means "last day of the month".
          const d = dateInMonth(y, m, day);
          if (inRange(d, start, end)) out.push(d);
        }
      });
      return out.sort(compareISO);
    }
    default:
      return [];
  }
}

/** Paychecks for one income in [start, end). Sorted by date. */
export function incomePaydays(income: Income, start: ISODate, end: ISODate): PayEvent[] {
  return incomeDates(income, start, end).map((date) => ({
    date,
    incomeId: income.id,
    name: income.name,
    amount: income.amount,
  }));
}

/** Group pay events by date (sources keep the order of the incomes list). */
function mergePayEvents(events: PayEvent[]): PayDay[] {
  const byDate = new Map<ISODate, PayEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.keys()].sort(compareISO).map((date) => {
    const sources = byDate.get(date) ?? [];
    return { date, amount: sources.reduce((s, e) => s + e.amount, 0), sources };
  });
}

/** Next `count` paydays with date >= from, across all incomes, merged by date. [] if no incomes. */
export function nextPaydays(incomes: Income[], from: ISODate, count: number): PayDay[] {
  if (incomes.length === 0 || count <= 0) return [];
  // Every frequency pays at least once per calendar month, so (count + 1) months always holds `count` paydays.
  const end = addDays(addMonthsClamped(from, count + 1), 1);
  const events = incomes.flatMap((inc) => incomePaydays(inc, from, end));
  return mergePayEvents(events).slice(0, count);
}

// ---------------------------------------------------------------------------------------------
// Bills & debts
// ---------------------------------------------------------------------------------------------

/** Due dates of a bill in [start, end). See Bill docs in types.ts for the rules. */
export function billDueDates(bill: Bill, start: ISODate, end: ISODate): ISODate[] {
  switch (bill.frequency) {
    case 'weekly':
      return everyNDays(bill.dueDate, 7, start, end);
    case 'biweekly':
      return everyNDays(bill.dueDate, 14, start, end);
    case 'monthly':
      return monthlyOnDay(bill.dueDay, start, end);
    case 'quarterly': {
      const anchor = monthIndex(monthKey(bill.dueDate));
      return monthlyOnDay(bill.dueDay, start, end, (y, m) => {
        const diff = y * 12 + (m - 1) - anchor;
        return ((diff % 3) + 3) % 3 === 0;
      });
    }
    case 'yearly': {
      const anchorMonth = isoParts(bill.dueDate).month;
      return monthlyOnDay(bill.dueDay, start, end, (_y, m) => m === anchorMonth);
    }
    default:
      return [];
  }
}

/** Monthly due dates of a debt in [start, end) (dueDay clamped to month end). [] if balance is 0. */
export function debtDueDates(debt: Debt, start: ISODate, end: ISODate): ISODate[] {
  if (!(debt.balance > 0)) return [];
  return monthlyOnDay(debt.dueDay, start, end);
}

export interface PlanItem {
  kind: 'bill' | 'debt';
  id: string;
  name: string;
  emoji: string;
  /** Bill occurrence amount, or the debt's minimum payment (capped at balance). */
  amount: Cents;
  date: ISODate;
  /** Bills only: paidMonth === monthKey(date). Debts: always false. */
  paid: boolean;
}

export interface PaycheckWindow {
  payday: PayDay;
  /** Exclusive end = the following payday's date. */
  end: ISODate;
  items: PlanItem[];
  total: Cents;
  /** payday.amount - total (may be negative). */
  left: Cents;
  /** max(0, total - payday.amount). */
  shortBy: Cents;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en-US', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Bill occurrences + debt minimum payments due in [start, end), sorted by date then name. */
export function itemsDueBetween(data: BudgetData, start: ISODate, end: ISODate): PlanItem[] {
  const items: PlanItem[] = [];
  for (const bill of data.bills) {
    for (const date of billDueDates(bill, start, end)) {
      items.push({
        kind: 'bill',
        id: bill.id,
        name: bill.name,
        emoji: bill.emoji,
        amount: bill.amount,
        date,
        paid: bill.paidMonth === monthKey(date),
      });
    }
  }
  for (const debt of data.debts) {
    const amount = Math.min(debt.minPayment, debt.balance);
    if (!(amount > 0)) continue;
    for (const date of debtDueDates(debt, start, end)) {
      items.push({
        kind: 'debt',
        id: debt.id,
        name: debt.name,
        emoji: DEBT_TYPE_INFO[debt.type]?.emoji ?? '📄',
        amount,
        date,
        paid: false,
      });
    }
  }
  return items.sort(
    (a, b) =>
      compareISO(a.date, b.date) ||
      compareText(a.name, b.name) ||
      (a.kind === b.kind ? 0 : a.kind === 'bill' ? -1 : 1) ||
      compareText(a.id, b.id),
  );
}

/**
 * The next `count` paydays on/after `today`. Window i covers [payday_i, payday_{i+1}).
 * Items = bill occurrences + debt minimum payments due in the window, sorted by date then name.
 * Returns [] when there are no incomes.
 */
export function paycheckPlan(data: BudgetData, today: ISODate, count = 4): PaycheckWindow[] {
  if (count <= 0) return [];
  const paydays = nextPaydays(data.incomes, today, count + 1);
  const windows: PaycheckWindow[] = [];
  for (let i = 0; i < Math.min(count, paydays.length); i++) {
    const payday = paydays[i];
    const end = paydays[i + 1]?.date ?? addMonthsClamped(payday.date, 1);
    const items = itemsDueBetween(data, payday.date, end);
    const total = items.reduce((s, it) => s + it.amount, 0);
    windows.push({
      payday,
      end,
      items,
      total,
      left: payday.amount - total,
      shortBy: Math.max(0, total - payday.amount),
    });
  }
  return windows;
}

/**
 * Months (from `from`, looking `monthsAhead` months ahead incl. `from`) in which this income pays MORE
 * times than usual: biweekly => months with 3 paydays; weekly => months with 5. [] for other frequencies.
 */
export function extraPaycheckMonths(
  income: Income,
  from: MonthKey,
  monthsAhead = 12,
): { month: MonthKey; count: number }[] {
  const usual = income.frequency === 'biweekly' ? 2 : income.frequency === 'weekly' ? 4 : null;
  if (usual === null) return [];
  const out: { month: MonthKey; count: number }[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const m = addMonthsToKey(from, i);
    const count = incomePaydays(income, monthStart(m), monthStart(addMonthsToKey(m, 1))).length;
    if (count > usual) out.push({ month: m, count });
  }
  return out;
}
