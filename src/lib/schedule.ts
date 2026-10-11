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
import { debtPaidThisMonth, minimumDue } from './debt';
import { DEBT_TYPE_INFO } from './presets';
import { compareText } from './text';

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
  /** The following payday (which incomes pay then), or null when there's only one income date known. */
  nextPayday: PayDay | null;
  items: PlanItem[];
  total: Cents;
  /** payday.amount - total (may be negative). */
  left: Cents;
  /** max(0, total - payday.amount). */
  shortBy: Cents;
  /** Bills and payments in this window not yet marked paid (what this paycheck really has to cover). */
  due: Cents;
  /**
   * Money from this paycheck to keep for a LATER window whose own paycheck can't cover it (e.g. a car payment on the
   * 5th when the next paycheck comes on the 6th).
   */
  holdForLater: Cents;
  /** The later bills that money is for (unpaid items of the short window(s) it covers). */
  holdFor: PlanItem[];
  /** The later payday that can't cover those bills on its own (the nearest short one), or null. */
  holdForPayday: PayDay | null;
  /** What's safe to move to savings or spend from this paycheck: paycheck − due − holdForLater (never negative). */
  safeToSave: Cents;
  /** For a short window: the earlier payday that keeps money for it, or null if it has to come from money on hand. */
  coveredBy: ISODate | null;
}

export interface PaycheckPlan {
  windows: PaycheckWindow[];
  /**
   * Money you need from what you already have (not from upcoming paychecks): unpaid bills due before the next payday,
   * plus any shortfall the upcoming paychecks can't cover. 0 when the paychecks cover everything.
   */
  needFromNow: Cents;
  /** Unpaid bills due from today until the next payday (part of needFromNow). */
  beforeNextPayday: PlanItem[];
}

/** Later paydays looked at so an early paycheck knows to hold money for a short later one. */
const LOOKAHEAD_WINDOWS = 3;

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
    // A debt paid down (or off) this month still shows this month's payment, marked paid once it's covered.
    const listed = { ...debt, balance: Math.max(debt.balance, debt.monthPaid?.amount ?? 0) };
    for (const date of debtDueDates(listed, start, end)) {
      const month = monthKey(date);
      const paidThatMonth = Math.max(0, debtPaidThisMonth(debt, month));
      const amount = minimumDue(debt.minPayment, debt.balance + paidThatMonth);
      if (!(amount > 0)) continue;
      items.push({
        kind: 'debt',
        id: debt.id,
        name: debt.name,
        emoji: DEBT_TYPE_INFO[debt.type]?.emoji ?? '📄',
        amount,
        date,
        paid: paidThatMonth >= amount,
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
  return paycheckPlanDetailed(data, today, count).windows;
}

/**
 * The next `count` paychecks with what each must cover, plus cash-flow safety: walking back from later paychecks,
 * a paycheck that can't cover the bills before the one after it gets covered by money kept from an earlier
 * paycheck (`holdForLater`), and `safeToSave` is what's left after that. Whatever the upcoming paychecks can't
 * cover (and unpaid bills due before the next payday) is `needFromNow`.
 */
export function paycheckPlanDetailed(data: BudgetData, today: ISODate, count = 4): PaycheckPlan {
  const beforeEnd = data.incomes.length > 0 ? nextPaydays(data.incomes, today, 1)[0]?.date : undefined;
  const beforeNextPayday = beforeEnd ? itemsDueBetween(data, today, beforeEnd).filter((it) => !it.paid) : [];
  const beforeTotal = beforeNextPayday.reduce((s, it) => s + it.amount, 0);
  if (count <= 0) return { windows: [], needFromNow: beforeTotal, beforeNextPayday };

  const all = count + LOOKAHEAD_WINDOWS;
  const paydays = nextPaydays(data.incomes, today, all + 1);
  const windows: PaycheckWindow[] = [];
  for (let i = 0; i < Math.min(all, paydays.length); i++) {
    const payday = paydays[i];
    const end = paydays[i + 1]?.date ?? addMonthsClamped(payday.date, 1);
    const items = itemsDueBetween(data, payday.date, end);
    const total = items.reduce((s, it) => s + it.amount, 0);
    const due = items.filter((it) => !it.paid).reduce((s, it) => s + it.amount, 0);
    windows.push({
      payday,
      end,
      nextPayday: paydays[i + 1] ?? null,
      items,
      total,
      left: payday.amount - total,
      shortBy: Math.max(0, total - payday.amount),
      due,
      holdForLater: 0,
      holdFor: [],
      holdForPayday: null,
      safeToSave: 0,
      coveredBy: null,
    });
  }

  // Walk back from the last paycheck: money a later paycheck is short is kept from the ones before it.
  let carry = 0;
  let pending: number[] = []; // windows whose shortfall is being carried back
  for (let i = windows.length - 1; i >= 0; i--) {
    const w = windows[i];
    const available = w.payday.amount - w.due;
    if (available >= carry) {
      w.holdForLater = carry;
      w.safeToSave = available - carry;
      if (carry > 0) {
        w.holdFor = pending.flatMap((j) => windows[j].items.filter((it) => !it.paid));
        w.holdForPayday = windows[pending[0]]?.payday ?? null;
        for (const j of pending) windows[j].coveredBy = w.payday.date;
      }
      carry = 0;
      pending = [];
    } else {
      // This paycheck can't cover it all: whatever it can spare goes toward the later shortfall, the rest carries on.
      const spare = Math.max(0, available);
      if (spare > 0 && carry > 0) {
        w.holdForLater = spare;
        w.holdFor = pending.flatMap((j) => windows[j].items.filter((it) => !it.paid));
        w.holdForPayday = windows[pending[0]]?.payday ?? null;
        for (const j of pending) windows[j].coveredBy = w.payday.date;
      }
      w.safeToSave = 0;
      carry = carry - available;
      if (available < 0) pending = [i, ...pending];
    }
  }
  // A short window covered only partly by earlier paychecks still needs money on hand.
  if (carry > 0) for (const j of pending) windows[j].coveredBy = null;

  return { windows: windows.slice(0, count), needFromNow: beforeTotal + carry, beforeNextPayday };
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

/**
 * Problem with a twice-a-month pair of paydays, or null. Rejects the same day twice, and days that come within a week of
 * each other in any month, counting across the month boundary (29/31 are both the 28th in February; the 28th and the 1st
 * are a day apart).
 */
export function semimonthlyDaysError(days: readonly [number, number]): string | null {
  if (days[0] === days[1]) return 'Please pick two different days.';
  for (const monthLength of [28, 29, 30, 31]) {
    const a = Math.min(days[0], monthLength);
    const b = Math.min(days[1], monthLength);
    const gap = Math.abs(a - b);
    if (Math.min(gap, monthLength - gap) < 7) return 'Please pick days at least a week apart.';
  }
  return null;
}
