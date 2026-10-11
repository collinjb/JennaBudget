import { describe, expect, it } from 'vitest';
import type { Account } from '../types';
import { rightNow } from './cash';
import { bill, budget, debt, income } from './testUtils';

const checking = (balance: number, updatedAt = '2026-10-11', id = 'chk'): Account => ({
  id,
  name: 'Checking',
  type: 'checking',
  balance,
  updatedAt,
});

// Paid every 2 weeks (next Oct 23), $400 on the 30th, phone on the 15th, car payment $500 on the 5th.
const base = (accounts: Account[]) =>
  budget({
    incomes: [
      income({ name: 'Main', amount: 136_500, frequency: 'biweekly', payDate: '2026-10-23' }),
      income({ name: 'Side', amount: 40_000, frequency: 'monthly', payDate: '2026-10-30' }),
    ],
    bills: [bill({ name: 'Phone', amount: 6_500, dueDay: 15 })],
    debts: [debt({ name: 'Car Loan', balance: 1_000_000, minPayment: 50_000, dueDay: 5 })],
    accounts,
  });

describe('rightNow', () => {
  it('is null until a checking account is added', () => {
    expect(rightNow(base([]), '2026-10-11')).toBeNull();
    expect(rightNow(base([{ ...checking(5_000), type: 'savings' }]), '2026-10-11')).toBeNull();
  });

  it('checking minus the bills due before the next paycheck is safe to use', () => {
    const r = rightNow(base([checking(120_000)]), '2026-10-11');
    expect(r?.nextPayday?.date).toBe('2026-10-23');
    expect(r?.dueItems.map((i) => i.name)).toEqual(['Phone']); // Oct 15
    expect(r?.dueBeforeNext).toBe(6_500);
    expect(r?.keepForLater).toBe(0); // the Oct 23 paycheck keeps money for the Nov 5 car payment
    expect(r?.safeNow).toBe(120_000 - 6_500);
    expect(r?.shortNow).toBe(0);
  });

  it('says how short checking is when it can’t cover what’s due', () => {
    const r = rightNow(base([checking(5_000)]), '2026-10-11');
    expect(r?.safeNow).toBe(0);
    expect(r?.shortNow).toBe(1_500);
  });

  it('adds up several checking accounts and reports the oldest update', () => {
    const r = rightNow(base([checking(10_000, '2026-10-09', 'a'), checking(20_000, '2026-10-11', 'b')]), '2026-10-11');
    expect(r?.checking).toBe(30_000);
    expect(r?.updatedAt).toBe('2026-10-09');
  });

  it('a bill already marked paid isn’t counted again', () => {
    const d = base([checking(120_000)]);
    d.bills = [{ ...d.bills[0], paidMonth: '2026-10' }];
    expect(rightNow(d, '2026-10-11')?.dueBeforeNext).toBe(0);
  });

  it('money the paychecks can’t cover has to stay in checking', () => {
    // Only the $400 side job before the car payment: the shortfall must come from checking.
    const d = budget({
      incomes: [income({ name: 'Side', amount: 40_000, frequency: 'monthly', payDate: '2026-10-30' })],
      debts: [debt({ name: 'Car Loan', balance: 1_000_000, minPayment: 50_000, dueDay: 5 })],
      accounts: [checking(30_000)],
    });
    const r = rightNow(d, '2026-10-11');
    expect(r?.keepForLater).toBeGreaterThanOrEqual(10_000);
    expect(r?.safeNow).toBe(Math.max(0, 30_000 - (r?.need ?? 0)));
  });
});
