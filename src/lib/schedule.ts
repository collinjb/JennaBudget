import type { Bill, BudgetData, Cents, Debt, ISODate, Income, MonthKey } from '../types';

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

/** Paychecks for one income in [start, end). Sorted by date. */
export function incomePaydays(income: Income, start: ISODate, end: ISODate): PayEvent[] {
  throw new Error('TODO incomePaydays');
}

/** Next `count` paydays with date >= from, across all incomes, merged by date. [] if no incomes. */
export function nextPaydays(incomes: Income[], from: ISODate, count: number): PayDay[] {
  throw new Error('TODO nextPaydays');
}

/** Due dates of a bill in [start, end). See Bill docs in types.ts for the rules. */
export function billDueDates(bill: Bill, start: ISODate, end: ISODate): ISODate[] {
  throw new Error('TODO billDueDates');
}

/** Monthly due dates of a debt in [start, end) (dueDay clamped to month end). [] if balance is 0. */
export function debtDueDates(debt: Debt, start: ISODate, end: ISODate): ISODate[] {
  throw new Error('TODO debtDueDates');
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

/**
 * The next `count` paydays on/after `today`. Window i covers [payday_i, payday_{i+1}).
 * Items = bill occurrences + debt minimum payments due in the window, sorted by date then name.
 * Returns [] when there are no incomes.
 */
export function paycheckPlan(data: BudgetData, today: ISODate, count?: number): PaycheckWindow[] {
  throw new Error('TODO paycheckPlan');
}

/**
 * Months (from `from`, looking `monthsAhead` months ahead incl. `from`) in which this income pays MORE
 * times than usual: biweekly => months with 3 paydays; weekly => months with 5. [] for other frequencies.
 */
export function extraPaycheckMonths(
  income: Income,
  from: MonthKey,
  monthsAhead?: number,
): { month: MonthKey; count: number }[] {
  throw new Error('TODO extraPaycheckMonths');
}
