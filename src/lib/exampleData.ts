import type { Bill, BudgetData, Debt, Goal, ISODate, Income, SpendingCategory } from '../types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../types';
import { addDays, addMonthsToKey, dateInMonth, dayOfWeek, isoParts, monthKey } from './dates';
import { newId } from './ids';

/**
 * A realistic example budget relative to `today` (settings.isExample = true, onboarded = true):
 * biweekly paycheck ~$1,450 + small side gig, rent/phone/car insurance/internet/streaming/utilities,
 * a student loan (~6.8%), a credit card (~24.99%), a car loan, Groceries/Gas (need), Fun Money (fun),
 * an Emergency Fund goal and a Florida Trip goal with a deadline. Leaves a modest positive Left Over.
 */
export function makeExampleBudget(today: ISODate): BudgetData {
  const { year, month, day } = isoParts(today);
  const thisMonth = monthKey(today);
  const inMonth = (offset: number, d: number): ISODate => {
    const m = addMonthsToKey(thisMonth, offset);
    return dateInMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)), d);
  };
  // The next Friday on or after today is a real payday for the biweekly paycheck.
  const nextFriday = addDays(today, (5 - dayOfWeek(today) + 7) % 7);

  const incomes: Income[] = [
    {
      id: newId(),
      name: 'Paycheck',
      amount: 145_000,
      frequency: 'biweekly',
      payDate: nextFriday,
      semimonthlyDays: [1, 15],
    },
    {
      // Paid on the same Fridays, so the Paycheck Plan shows two sources merged into one payday.
      id: newId(),
      name: 'Side gig',
      amount: 12_000,
      frequency: 'biweekly',
      payDate: nextFriday,
      semimonthlyDays: [1, 15],
    },
  ];

  // Bills already due earlier this month are shown as paid, like a real month in progress.
  const paidIfPast = (dueDay: number) => (dueDay < day ? thisMonth : null);
  const monthlyBill = (name: string, emoji: string, amount: number, dueDay: number): Bill => ({
    id: newId(),
    name,
    emoji,
    amount,
    frequency: 'monthly',
    dueDay,
    dueDate: dateInMonth(year, month, dueDay),
    paidMonth: paidIfPast(dueDay),
  });
  const bills: Bill[] = [
    monthlyBill('Rent', '🏠', 140_000, 1),
    monthlyBill('Phone', '📱', 6_500, 12),
    monthlyBill('Internet', '🌐', 6_000, 25),
    monthlyBill('Netflix', '🎬', 1_549, 8),
    monthlyBill('Utilities', '💡', 9_000, 18),
    {
      // Paid every 3 months, starting next month, so the "Not due this month" state shows up too.
      id: newId(),
      name: 'Car Insurance',
      emoji: '🚗',
      amount: 36_000,
      frequency: 'quarterly',
      dueDay: 20,
      dueDate: inMonth(1, 20),
      paidMonth: null,
    },
  ];

  const debts: Debt[] = [
    { id: newId(), name: 'Student Loan', type: 'student', balance: 1_450_000, rateBps: 680, minPayment: 16_500, dueDay: 15 },
    { id: newId(), name: 'Credit Card', type: 'credit', balance: 240_000, rateBps: 2499, minPayment: 7_500, dueDay: 22 },
    { id: newId(), name: 'Car Loan', type: 'car', balance: 820_000, rateBps: 590, minPayment: 24_500, dueDay: 5 },
  ];

  const spending: SpendingCategory[] = [
    { id: newId(), name: 'Groceries', emoji: '🛒', monthly: 35_000, kind: 'need' },
    { id: newId(), name: 'Gas', emoji: '⛽', monthly: 14_000, kind: 'need' },
    { id: newId(), name: 'Fun Money', emoji: '🎉', monthly: 10_000, kind: 'fun' },
    { id: newId(), name: 'Eating Out', emoji: '🍔', monthly: 5_000, kind: 'fun' },
  ];

  const goals: Goal[] = [
    {
      id: newId(),
      name: 'Emergency Fund',
      emoji: '🛟',
      target: 200_000,
      saved: 65_000,
      monthly: 10_000,
      targetDate: null,
      isEmergencyFund: true,
    },
    {
      id: newId(),
      name: 'Florida Trip',
      emoji: '🏖️',
      target: 150_000,
      saved: 40_000,
      monthly: 10_000,
      targetDate: inMonth(8, 15),
      isEmergencyFund: false,
    },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    incomes,
    bills,
    debts,
    spending,
    goals,
    settings: { ...DEFAULT_SETTINGS, payoffMethod: 'avalanche', extraDebtPayment: 2_500, onboarded: true, isExample: true },
  };
}
