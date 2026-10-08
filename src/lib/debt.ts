import type { Cents, Debt, MonthKey, PayoffMethod } from '../types';

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
  throw new Error('TODO payoffOrder');
}

/** One month of interest: round-half-up(balance × rateBps / 120000). */
export function monthlyInterest(balance: Cents, rateBps: number): Cents {
  throw new Error('TODO monthlyInterest');
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
  throw new Error('TODO simulatePayoff');
}

export interface InterestWarning {
  debtId: string;
  name: string;
  monthlyInterest: Cents;
  minPayment: Cents;
}

/** Debts (balance > 0, rate > 0) whose minPayment <= their first month of interest: they'd never shrink on their own. */
export function interestWarnings(debts: Debt[]): InterestWarning[] {
  throw new Error('TODO interestWarnings');
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
  throw new Error('TODO compareExtra');
}
