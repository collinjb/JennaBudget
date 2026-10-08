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
 * How each frequency turns into a monthly amount: × mul ÷ div. The ONE place these factors live; `toMonthly` and the
 * in-app "How we calculate this" explainer both read them.
 * weekly ×52÷12 · biweekly ×26÷12 · semimonthly ×2 · monthly ×1 · quarterly ÷3 · yearly ÷12
 */
export const MONTHLY_FACTORS: Record<AnyFrequency, { mul: number; div: number }> = {
  weekly: { mul: 52, div: 12 },
  biweekly: { mul: 26, div: 12 },
  semimonthly: { mul: 2, div: 1 },
  monthly: { mul: 1, div: 1 },
  quarterly: { mul: 1, div: 3 },
  yearly: { mul: 1, div: 12 },
};

/** Every frequency, in the order the explainer lists them (shortest to longest). */
export const ALL_FREQUENCIES: AnyFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'];

/** '× 52 ÷ 12', '× 2', '× 1', '÷ 3' (for the explainer). */
export function factorText(freq: AnyFrequency): string {
  const { mul, div } = MONTHLY_FACTORS[freq];
  const parts = [mul !== 1 || div === 1 ? `× ${mul}` : '', div !== 1 ? `÷ ${div}` : ''].filter(Boolean);
  return parts.join(' ');
}

/**
 * Convert an amount at a frequency to a monthly amount, rounded half-up ONCE at the end (see MONTHLY_FACTORS).
 */
export function toMonthly(amount: Cents, freq: AnyFrequency): Cents {
  const { mul, div } = MONTHLY_FACTORS[freq];
  return div === 1 ? amount * mul : roundDiv(amount * mul, div);
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
