// Small factories for unit tests (not used by the app).
import type { Bill, BudgetData, Debt, Goal, Income, SpendingCategory } from '../types';
import { emptyBudget } from '../types';

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function income(over: Partial<Income> = {}): Income {
  return {
    id: nextId('inc'),
    name: 'Paycheck',
    amount: 145_000,
    frequency: 'biweekly',
    payDate: '2026-10-09',
    semimonthlyDays: [1, 15],
    ...over,
  };
}

export function bill(over: Partial<Bill> = {}): Bill {
  return {
    id: nextId('bill'),
    name: 'Rent',
    emoji: '🏠',
    amount: 90_000,
    frequency: 'monthly',
    dueDay: 1,
    dueDate: '2026-10-01',
    paidMonth: null,
    ...over,
  };
}

export function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: nextId('debt'),
    name: 'Credit Card',
    type: 'credit',
    balance: 200_000,
    rateBps: 2499,
    minPayment: 5_000,
    dueDay: 22,
    ...over,
  };
}

export function spending(over: Partial<SpendingCategory> = {}): SpendingCategory {
  return { id: nextId('sp'), name: 'Groceries', emoji: '🛒', monthly: 30_000, kind: 'need', ...over };
}

export function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: nextId('goal'),
    name: 'Trip',
    emoji: '✈️',
    target: 150_000,
    saved: 0,
    monthly: 0,
    targetDate: null,
    isEmergencyFund: false,
    ...over,
  };
}

export function budget(over: Partial<Omit<BudgetData, 'settings'>> & { settings?: Partial<BudgetData['settings']> } = {}): BudgetData {
  const base = emptyBudget();
  return {
    ...base,
    ...over,
    settings: { ...base.settings, onboarded: true, ...over.settings },
  };
}
