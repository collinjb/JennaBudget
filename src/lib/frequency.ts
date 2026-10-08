import type { Bill, BillFrequency, Cents, Income, IncomeFrequency } from '../types';

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
  throw new Error('TODO toMonthly');
}
/** True when the monthly figure is an estimate (anything but 'monthly' and 'semimonthly'). Show "≈". */
export function isApproxMonthly(freq: AnyFrequency): boolean {
  throw new Error('TODO isApproxMonthly');
}
export function incomeMonthly(i: Income): Cents {
  throw new Error('TODO incomeMonthly');
}
export function billMonthly(b: Bill): Cents {
  throw new Error('TODO billMonthly');
}
