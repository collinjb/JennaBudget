import type { Cents, Debt, MonthKey, PayoffMethod } from '../types';
import { addMonthsToKey } from './dates';
import { roundDiv } from './money';
import { compareText } from './text';

export const MAX_PAYOFF_MONTHS = 600;

export interface PayoffOptions {
  method: PayoffMethod;
  /** Extra per month on top of all minimums. */
  extra: Cents;
  /** The CURRENT month. The first simulated payment happens in startMonth + 1. */
  startMonth: MonthKey;
  /** Defaults to MAX_PAYOFF_MONTHS. */
  maxMonths?: number;
}

export interface DebtPayoffInfo {
  id: string;
  name: string;
  /** 1-based position in payoff order. */
  order: number;
  /** Months until this debt hits 0, or null if not within maxMonths. */
  months: number | null;
  /** startMonth + months, or null. */
  payoffMonth: MonthKey | null;
  interestPaid: Cents;
}

export interface PayoffResult {
  /** Months until ALL debt is 0. 0 when there is no debt. null when not paid off within maxMonths. */
  months: number | null;
  /** startMonth + months, or null. */
  debtFreeMonth: MonthKey | null;
  /** Interest over the simulation (if months is null: over maxMonths). */
  totalInterest: Cents;
  totalPaid: Cents;
  /** Sorted by payoff (months asc, nulls last, then by order). */
  perDebt: DebtPayoffInfo[];
  /** timeline[0] = starting total balance; timeline[k] = total balance after month k. */
  timeline: Cents[];
  /** Sum of minimums (of debts with balance > 0) + extra: the fixed monthly amount thrown at debt. */
  monthlyBudget: Cents;
}

/**
 * Priority order for extra money.
 * avalanche: highest rateBps first; ties -> smaller balance first; ties -> name.
 * snowball: smallest balance first; ties -> higher rate first; ties -> name.
 * Only debts with balance > 0.
 */
export function payoffOrder(debts: Debt[], method: PayoffMethod): Debt[] {
  const active = debts.filter((d) => d.balance > 0);
  const byName = (a: Debt, b: Debt) => compareText(a.name, b.name) || compareText(a.id, b.id);
  if (method === 'snowball') {
    return active.sort((a, b) => a.balance - b.balance || b.rateBps - a.rateBps || byName(a, b));
  }
  return active.sort((a, b) => b.rateBps - a.rateBps || a.balance - b.balance || byName(a, b));
}

/** One month of interest: round-half-up(balance × rateBps / 120000). */
export function monthlyInterest(balance: Cents, rateBps: number): Cents {
  if (!(balance > 0) || !(rateBps > 0)) return 0;
  return roundDiv(balance * rateBps, 120_000);
}

/**
 * Month-by-month simulation with rollover. Each month:
 *  1) every active debt accrues monthlyInterest;
 *  2) pool = monthlyBudget (constant every month);
 *  3) pay each active debt min(minPayment, balance) from the pool;
 *  4) whatever is left in the pool goes to debts in payoffOrder (capped at each balance), cascading;
 *  5) never overpay; money left after all debts are 0 is simply not spent.
 * Stops when all balances are 0 or after maxMonths.
 */
export function simulatePayoff(debts: Debt[], opts: PayoffOptions): PayoffResult {
  const maxMonths = Math.max(0, Math.floor(opts.maxMonths ?? MAX_PAYOFF_MONTHS));
  const order = payoffOrder(debts, opts.method);
  const extra = Math.max(0, opts.extra);
  const monthlyBudget = order.reduce((s, d) => s + minimumDue(d.minPayment, d.balance), 0) + extra;

  const balances = order.map((d) => d.balance);
  const interestPaid = order.map(() => 0);
  const paidOffAt: (number | null)[] = order.map(() => null);
  let total = balances.reduce((s, b) => s + b, 0);
  const timeline: Cents[] = [total];
  let totalInterest = 0;
  let totalPaid = 0;
  let months: number | null = order.length === 0 ? 0 : null;

  for (let month = 1; month <= maxMonths && months === null; month++) {
    // 1) Interest on every debt that still has a balance.
    for (let i = 0; i < order.length; i++) {
      if (balances[i] <= 0) continue;
      const interest = monthlyInterest(balances[i], order[i].rateBps);
      balances[i] += interest;
      interestPaid[i] += interest;
      totalInterest += interest;
    }
    // 2) The same amount goes to debt every month.
    let pool = monthlyBudget;
    // 3) Minimums (never more than what's owed, never more than what's in the pool).
    for (let i = 0; i < order.length && pool > 0; i++) {
      if (balances[i] <= 0) continue;
      const pay = Math.min(minimumDue(order[i].minPayment, balances[i]), pool);
      balances[i] -= pay;
      pool -= pay;
      totalPaid += pay;
    }
    // 4) Whatever is left goes to debts in payoff order, cascading to the next one.
    for (let i = 0; i < order.length && pool > 0; i++) {
      if (balances[i] <= 0) continue;
      const pay = Math.min(balances[i], pool);
      balances[i] -= pay;
      pool -= pay;
      totalPaid += pay;
    }
    total = 0;
    for (let i = 0; i < order.length; i++) {
      if (balances[i] <= 0 && paidOffAt[i] === null) paidOffAt[i] = month;
      total += balances[i];
    }
    timeline.push(total);
    if (total <= 0) months = month;
  }

  const perDebt: DebtPayoffInfo[] = order.map((d, i) => ({
    id: d.id,
    name: d.name,
    order: i + 1,
    months: paidOffAt[i],
    payoffMonth: paidOffAt[i] === null ? null : addMonthsToKey(opts.startMonth, paidOffAt[i] as number),
    interestPaid: interestPaid[i],
  }));
  perDebt.sort((a, b) => {
    if (a.months === null && b.months === null) return a.order - b.order;
    if (a.months === null) return 1;
    if (b.months === null) return -1;
    return a.months - b.months || a.order - b.order;
  });

  return {
    months,
    debtFreeMonth: months === null ? null : addMonthsToKey(opts.startMonth, months),
    totalInterest,
    totalPaid,
    perDebt,
    timeline,
    monthlyBudget,
  };
}

/**
 * The minimum payment that applies to a balance: min(minPayment, balance), never negative.
 * The one place this rule lives (monthly summary, payoff simulation and Paycheck Plan all use it).
 */
export function minimumDue(minPayment: Cents, balance: Cents): Cents {
  return Math.max(0, Math.min(minPayment, balance));
}

/**
 * Why a debt never gets paid off on its own:
 * - 'grows': the minimum is less than a month of interest, so the balance keeps growing;
 * - 'flat': the minimum exactly equals the interest, so the balance never goes down;
 * - 'no-payment': there is no minimum payment at all (any rate, including 0%).
 */
export type InterestWarningKind = 'grows' | 'flat' | 'no-payment';

export interface InterestWarning {
  debtId: string;
  name: string;
  kind: InterestWarningKind;
  monthlyInterest: Cents;
  minPayment: Cents;
}

/**
 * Debts with a balance that would never shrink on their own (see InterestWarningKind), in the order given.
 * A debt with no minimum payment is 'no-payment' whatever its rate; otherwise minPayment < interest is 'grows' and
 * minPayment === interest is 'flat'. Debts whose minimum beats the interest (or 0% debts with a minimum) aren't listed.
 */
export function interestWarnings(debts: Debt[]): InterestWarning[] {
  const out: InterestWarning[] = [];
  for (const d of debts) {
    if (!(d.balance > 0)) continue;
    const interest = monthlyInterest(d.balance, d.rateBps);
    let kind: InterestWarningKind | null = null;
    if (!(d.minPayment > 0)) kind = 'no-payment';
    else if (d.minPayment < interest) kind = 'grows';
    else if (d.minPayment === interest) kind = 'flat';
    if (kind) out.push({ debtId: d.id, name: d.name, kind, monthlyInterest: interest, minPayment: d.minPayment });
  }
  return out;
}

export interface ExtraComparison {
  base: PayoffResult;
  withExtra: PayoffResult;
  /** base.months - withExtra.months when both are numbers; otherwise null (UI handles "instead of never"). */
  monthsSooner: number | null;
  /** max(0, base.totalInterest - withExtra.totalInterest) */
  interestSaved: Cents;
}

export function compareExtra(
  debts: Debt[],
  method: PayoffMethod,
  baseExtra: Cents,
  newExtra: Cents,
  startMonth: MonthKey,
): ExtraComparison {
  const base = simulatePayoff(debts, { method, extra: baseExtra, startMonth });
  const withExtra = simulatePayoff(debts, { method, extra: newExtra, startMonth });
  return comparePayoffs(base, withExtra);
}

/** Compare two payoff results that were already simulated (lets a slider reuse the unchanged "base" run). */
export function comparePayoffs(base: PayoffResult, withExtra: PayoffResult): ExtraComparison {
  const monthsSooner = base.months !== null && withExtra.months !== null ? base.months - withExtra.months : null;
  return {
    base,
    withExtra,
    monthsSooner,
    interestSaved: Math.max(0, base.totalInterest - withExtra.totalInterest),
  };
}
