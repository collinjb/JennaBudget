import type { Bill, BudgetData, Cents, ISODate, MonthKey } from '../types';

export interface MonthlySummary {
  /** Sum of incomeMonthly over all incomes. */
  income: Cents;
  /** Sum of billMonthly over all bills. */
  bills: Cents;
  /** Sum of min(minPayment, balance) over debts with balance > 0. */
  debtMinimums: Cents;
  /** settings.extraDebtPayment if any debt has balance > 0, else 0. */
  debtExtra: Cents;
  /** debtMinimums + debtExtra */
  debt: Cents;
  spendingNeeds: Cents;
  spendingFun: Cents;
  /** spendingNeeds + spendingFun */
  spending: Cents;
  /** Sum of goal.monthly for goals not yet reached (saved < target). */
  savings: Cents;
  /** bills + debt + spending + savings */
  outgo: Cents;
  /** income - outgo (negative = over budget) */
  leftOver: Cents;
}

export function monthlySummary(data: BudgetData): MonthlySummary {
  throw new Error('TODO monthlySummary');
}

export type BreakdownKey = 'bills' | 'debt' | 'savings' | 'spending' | 'leftOver';

export interface HomeBreakdown {
  /** Whole-dollar values (cents, multiples of 100) via apportionDollars. Order: bills, debt, savings, spending, leftOver. */
  parts: { key: BreakdownKey; cents: Cents }[];
  /** Whole-dollar income; equals sum of parts when not over budget. */
  income: Cents;
  /** Whole-dollar left over (negative when over budget). */
  leftOver: Cents;
  over: boolean;
}

/**
 * Whole-dollar version of the summary for Home, so displayed parts always add up.
 * When leftOver >= 0: parts = apportionDollars([bills, debt, savings, spending, leftOver]) and they sum to income.
 * When over budget: leftOver part is 0 and `leftOver` = -(whole-dollar overage) = apportioned income - apportioned outgo.
 */
export function homeBreakdown(summary: MonthlySummary): HomeBreakdown {
  throw new Error('TODO homeBreakdown');
}

export interface BillMonthStatus {
  bill: Bill;
  dueDates: ISODate[];
  /** amount × number of due dates this month */
  amountThisMonth: Cents;
  dueThisMonth: boolean;
  paid: boolean;
}

export interface BillsMonth {
  /** Due this month first (sorted by first due date, then name), then not-due-this-month (by name). */
  items: BillMonthStatus[];
  dueCount: number;
  paidCount: number;
  /** Sum of amountThisMonth for unpaid bills due this month. */
  leftToPay: Cents;
  /** Sum of amountThisMonth for all bills due this month. */
  totalThisMonth: Cents;
}

export function billsForMonth(data: BudgetData, month: MonthKey): BillsMonth {
  throw new Error('TODO billsForMonth');
}
