import type { Bill, BillFrequency, Cents, Income, IncomeFrequency } from '../types';
import { roundDiv } from './money';

export type AnyFrequency = IncomeFrequency | BillFrequency;

/** Plain-English labels, e.g. for selects: 'Every week', 'Every 2 weeks', 'Twice a month', 'Every month', 'Every 3 months', 'Once a year'. */
export const FREQUENCY_LABELS: Record<AnyFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  yearly: 'Once a year',
};

/** Short suffix for amounts: '/wk', '/2 wks', '/half-month', '/mo', '/3 mo', '/yr'. */
export const FREQUENCY_SUFFIX: Record<AnyFrequency, string> = {
  weekly: '/wk',
  biweekly: '/2 wks',
  semimonthly: ' twice a month',
  monthly: '/mo',
  quarterly: '/3 mo',
  yearly: '/yr',
};

/**
 * Convert an amount at a frequency to a monthly amount, rounded half-up ONCE at the end.
 * weekly ×52÷12 · biweekly ×26÷12 · semimonthly ×2 · monthly ×1 · quarterly ÷3 · yearly ÷12
 */
export function toMonthly(amount: Cents, freq: AnyFrequency): Cents {
  switch (freq) {
    case 'weekly':
      return roundDiv(amount * 52, 12);
    case 'biweekly':
      return roundDiv(amount * 26, 12);
    case 'semimonthly':
      return amount * 2;
    case 'monthly':
      return amount;
    case 'quarterly':
      return roundDiv(amount, 3);
    case 'yearly':
      return roundDiv(amount, 12);
  }
}
/** True when the monthly figure is an estimate (anything but 'monthly' and 'semimonthly'). Show "≈". */
export function isApproxMonthly(freq: AnyFrequency): boolean {
  return freq !== 'monthly' && freq !== 'semimonthly';
}
export function incomeMonthly(i: Income): Cents {
  return toMonthly(i.amount, i.frequency);
}
export function billMonthly(b: Bill): Cents {
  return toMonthly(b.amount, b.frequency);
}
