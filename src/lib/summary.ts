import type { Bill, BudgetData, Cents, ISODate, MonthKey } from '../types';
import { addMonthsToKey, compareISO, monthStart } from './dates';
import { minimumDue } from './debt';
import { billMonthly, incomeMonthly } from './frequency';
import { apportionDollars, roundDiv } from './money';
import { billDueDates } from './schedule';
import { compareText } from './text';

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
  const income = sum(data.incomes.map(incomeMonthly));
  const bills = sum(data.bills.map(billMonthly));
  const activeDebts = data.debts.filter((d) => d.balance > 0);
  const debtMinimums = sum(activeDebts.map((d) => minimumDue(d.minPayment, d.balance)));
  const debtExtra = activeDebts.length > 0 ? Math.max(0, data.settings.extraDebtPayment) : 0;
  const debt = debtMinimums + debtExtra;
  const spendingNeeds = sum(data.spending.filter((s) => s.kind === 'need').map((s) => s.monthly));
  const spendingFun = sum(data.spending.filter((s) => s.kind !== 'need').map((s) => s.monthly));
  const spending = spendingNeeds + spendingFun;
  const savings = sum(data.goals.filter((g) => g.saved < g.target).map((g) => g.monthly));
  const outgo = bills + debt + spending + savings;
  return {
    income,
    bills,
    debtMinimums,
    debtExtra,
    debt,
    spendingNeeds,
    spendingFun,
    spending,
    savings,
    outgo,
    leftOver: income - outgo,
  };
}

function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
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
  const { bills, debt, savings, spending } = summary;
  if (summary.leftOver >= 0) {
    const [b, d, sv, sp, lo] = apportionDollars([bills, debt, savings, spending, summary.leftOver]);
    return {
      parts: [
        { key: 'bills', cents: b },
        { key: 'debt', cents: d },
        { key: 'savings', cents: sv },
        { key: 'spending', cents: sp },
        { key: 'leftOver', cents: lo },
      ],
      income: b + d + sv + sp + lo,
      leftOver: lo,
      over: false,
    };
  }
  const out = apportionDollars([bills, debt, savings, spending]);
  const income = roundDiv(summary.income, 100) * 100;
  // Never show "$0 over" when the real figure is over by a few cents: round the outgo up so it's at least
  // $1 more than income (bumping the largest part), which keeps "parts = income + overage" exact.
  const shortOfOneDollar = income + 100 - out.reduce((s, x) => s + x, 0);
  if (shortOfOneDollar > 0) {
    const largest = out.indexOf(Math.max(...out));
    out[largest] += shortOfOneDollar;
  }
  const [b, d, sv, sp] = out;
  const leftOver = income - (b + d + sv + sp);
  return {
    parts: [
      { key: 'bills', cents: b },
      { key: 'debt', cents: d },
      { key: 'savings', cents: sv },
      { key: 'spending', cents: sp },
      { key: 'leftOver', cents: 0 },
    ],
    income,
    leftOver,
    over: true,
  };
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
  const start = monthStart(month);
  const end = monthStart(addMonthsToKey(month, 1));
  const all: BillMonthStatus[] = data.bills.map((bill) => {
    const dueDates = billDueDates(bill, start, end);
    return {
      bill,
      dueDates,
      amountThisMonth: bill.amount * dueDates.length,
      dueThisMonth: dueDates.length > 0,
      paid: bill.paidMonth === month,
    };
  });
  const due = all
    .filter((s) => s.dueThisMonth)
    .sort((a, b) => compareISO(a.dueDates[0], b.dueDates[0]) || compareText(a.bill.name, b.bill.name));
  const notDue = all.filter((s) => !s.dueThisMonth).sort((a, b) => compareText(a.bill.name, b.bill.name));
  let paidCount = 0;
  let leftToPay = 0;
  let totalThisMonth = 0;
  for (const s of due) {
    totalThisMonth += s.amountThisMonth;
    if (s.paid) paidCount++;
    else leftToPay += s.amountThisMonth;
  }
  return { items: [...due, ...notDue], dueCount: due.length, paidCount, leftToPay, totalThisMonth };
}

