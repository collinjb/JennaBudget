import { describe, expect, it } from 'vitest';
import type { Bill, Income } from '../types';
import { FREQUENCY_LABELS, FREQUENCY_SUFFIX, billMonthly, incomeMonthly, isApproxMonthly, toMonthly } from './frequency';

describe('toMonthly', () => {
  it('weekly ×52÷12, rounded half-up once', () => {
    expect(toMonthly(50_000, 'weekly')).toBe(216_667); // $500/wk => $2,166.67
    expect(toMonthly(3, 'weekly')).toBe(13); // 156/12 exactly
    expect(toMonthly(1, 'weekly')).toBe(4); // 4.33
    expect(toMonthly(0, 'weekly')).toBe(0);
  });

  it('biweekly ×26÷12', () => {
    expect(toMonthly(145_000, 'biweekly')).toBe(314_167); // $1,450 => $3,141.67 (3,141.666…)
    expect(toMonthly(3, 'biweekly')).toBe(7); // 6.5 rounds half-up
    expect(toMonthly(1, 'biweekly')).toBe(2); // 2.1667
    expect(toMonthly(12_000, 'biweekly')).toBe(26_000);
  });

  it('semimonthly ×2 and monthly ×1', () => {
    expect(toMonthly(100_000, 'semimonthly')).toBe(200_000);
    expect(toMonthly(12_345, 'semimonthly')).toBe(24_690);
    expect(toMonthly(123_456, 'monthly')).toBe(123_456);
  });

  it('quarterly ÷3', () => {
    expect(toMonthly(36_000, 'quarterly')).toBe(12_000);
    expect(toMonthly(10_000, 'quarterly')).toBe(3_333); // 3,333.33
    expect(toMonthly(50, 'quarterly')).toBe(17); // 16.67
    expect(toMonthly(100, 'quarterly')).toBe(33);
  });

  it('yearly ÷12', () => {
    expect(toMonthly(60_000, 'yearly')).toBe(5_000); // $600/yr => $50/mo
    expect(toMonthly(13_900, 'yearly')).toBe(1_158); // 1,158.33
    expect(toMonthly(6, 'yearly')).toBe(1); // 0.5 rounds half-up
    expect(toMonthly(5, 'yearly')).toBe(0);
  });

  it('always returns integer cents', () => {
    for (const freq of ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'] as const) {
      for (let a = 0; a < 2000; a += 37) expect(Number.isInteger(toMonthly(a, freq))).toBe(true);
    }
  });
});

describe('isApproxMonthly and labels', () => {
  it('only monthly and twice-a-month are exact', () => {
    expect(isApproxMonthly('monthly')).toBe(false);
    expect(isApproxMonthly('semimonthly')).toBe(false);
    expect(isApproxMonthly('weekly')).toBe(true);
    expect(isApproxMonthly('biweekly')).toBe(true);
    expect(isApproxMonthly('quarterly')).toBe(true);
    expect(isApproxMonthly('yearly')).toBe(true);
  });
  it('has a label and suffix for every frequency', () => {
    expect(Object.keys(FREQUENCY_LABELS).sort()).toEqual(Object.keys(FREQUENCY_SUFFIX).sort());
    expect(FREQUENCY_LABELS.biweekly).toBe('Every 2 weeks');
  });
});

describe('incomeMonthly / billMonthly', () => {
  it('use the item frequency', () => {
    const income: Income = {
      id: 'i',
      name: 'Paycheck',
      amount: 145_000,
      frequency: 'biweekly',
      payDate: '2026-10-09',
      semimonthlyDays: [1, 15],
    };
    expect(incomeMonthly(income)).toBe(314_167);
    expect(incomeMonthly({ ...income, frequency: 'semimonthly' })).toBe(290_000);
    const bill: Bill = {
      id: 'b',
      name: 'Prime',
      emoji: '📦',
      amount: 13_900,
      frequency: 'yearly',
      dueDay: 10,
      dueDate: '2027-03-10',
      paidMonth: null,
    };
    expect(billMonthly(bill)).toBe(1_158);
    expect(billMonthly({ ...bill, frequency: 'monthly' })).toBe(13_900);
  });
});
