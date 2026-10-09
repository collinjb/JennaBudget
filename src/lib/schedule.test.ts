import { describe, expect, it } from 'vitest';
import { addDays, compareISO, diffDays } from './dates';
import {
  billDueDates,
  debtDueDates,
  extraPaycheckMonths,
  incomePaydays,
  itemsDueBetween,
  nextPaydays,
  paycheckPlan,
  semimonthlyDaysError,
} from './schedule';
import { bill, budget, debt, income } from './testUtils';

const dates = (events: { date: string }[]) => events.map((e) => e.date);

describe('incomePaydays', () => {
  it('biweekly with the anchor in the past', () => {
    const inc = income({ frequency: 'biweekly', payDate: '2026-01-02' });
    expect(dates(incomePaydays(inc, '2026-10-01', '2026-11-01'))).toEqual(['2026-10-09', '2026-10-23']);
  });

  it('biweekly with the anchor in the future gives the same schedule', () => {
    const past = income({ frequency: 'biweekly', payDate: '2026-01-02' });
    const future = income({ frequency: 'biweekly', payDate: '2027-02-26' }); // 2026-10-09 + 140 days
    expect(diffDays('2026-10-09', '2027-02-26')).toBe(140);
    for (const [s, e] of [
      ['2026-10-01', '2026-11-01'],
      ['2025-12-01', '2026-03-01'],
      ['2027-06-01', '2027-09-15'],
    ]) {
      expect(dates(incomePaydays(future, s, e))).toEqual(dates(incomePaydays(past, s, e)));
    }
  });

  it('every biweekly payday is exactly 14 days apart and lands on the anchor weekday', () => {
    const inc = income({ frequency: 'biweekly', payDate: '2026-10-09' });
    const ds = dates(incomePaydays(inc, '2025-01-01', '2028-01-01'));
    expect(ds.length).toBeGreaterThan(75);
    for (let i = 1; i < ds.length; i++) expect(diffDays(ds[i - 1], ds[i])).toBe(14);
    expect(ds.every((d) => diffDays('2026-10-09', d) % 14 === 0)).toBe(true);
  });

  it('weekly', () => {
    const inc = income({ frequency: 'weekly', payDate: '2026-10-09' });
    expect(dates(incomePaydays(inc, '2026-10-01', '2026-11-01'))).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
      '2026-10-30',
    ]);
  });

  it('weekly/biweekly across DST changes stay on the same weekday', () => {
    const inc = income({ frequency: 'weekly', payDate: '2026-03-06' });
    expect(dates(incomePaydays(inc, '2026-03-01', '2026-03-20'))).toEqual(['2026-03-06', '2026-03-13']);
    const inc2 = income({ frequency: 'biweekly', payDate: '2026-10-23' });
    expect(dates(incomePaydays(inc2, '2026-10-20', '2026-11-20'))).toEqual(['2026-10-23', '2026-11-06']);
  });

  it('ranges are half-open [start, end)', () => {
    const inc = income({ frequency: 'biweekly', payDate: '2026-10-09' });
    expect(dates(incomePaydays(inc, '2026-10-09', '2026-10-23'))).toEqual(['2026-10-09']);
    expect(dates(incomePaydays(inc, '2026-10-10', '2026-10-23'))).toEqual([]);
    expect(dates(incomePaydays(inc, '2026-10-09', '2026-10-24'))).toEqual(['2026-10-09', '2026-10-23']);
    expect(incomePaydays(inc, '2026-10-23', '2026-10-09')).toEqual([]);
    expect(incomePaydays(inc, '2026-10-23', '2026-10-23')).toEqual([]);
  });

  it('monthly payday on the 31st clamps to the month end', () => {
    const inc = income({ frequency: 'monthly', payDate: '2026-01-31' });
    expect(dates(incomePaydays(inc, '2026-01-01', '2026-07-01'))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
    expect(dates(incomePaydays(inc, '2028-02-01', '2028-03-01'))).toEqual(['2028-02-29']);
  });

  it('monthly works before the anchor too', () => {
    const inc = income({ frequency: 'monthly', payDate: '2027-05-15' });
    expect(dates(incomePaydays(inc, '2026-10-01', '2026-12-01'))).toEqual(['2026-10-15', '2026-11-15']);
  });

  it('semimonthly on the 15th and last day, including February', () => {
    const inc = income({ frequency: 'semimonthly', semimonthlyDays: [15, 31] });
    expect(dates(incomePaydays(inc, '2026-02-01', '2026-03-01'))).toEqual(['2026-02-15', '2026-02-28']);
    expect(dates(incomePaydays(inc, '2028-02-01', '2028-03-01'))).toEqual(['2028-02-15', '2028-02-29']);
    expect(dates(incomePaydays(inc, '2026-04-01', '2026-05-01'))).toEqual(['2026-04-15', '2026-04-30']);
    expect(dates(incomePaydays(inc, '2026-10-01', '2026-11-01'))).toEqual(['2026-10-15', '2026-10-31']);
  });

  it('semimonthly 1st & 15th ignores payDate and sorts days', () => {
    const inc = income({ frequency: 'semimonthly', payDate: '2020-01-07', semimonthlyDays: [15, 1] as [number, number] });
    expect(dates(incomePaydays(inc, '2026-10-01', '2026-12-01'))).toEqual([
      '2026-10-01',
      '2026-10-15',
      '2026-11-01',
      '2026-11-15',
    ]);
  });

  it('pay events carry the income details', () => {
    const inc = income({ id: 'job', name: 'Job', amount: 100_000, frequency: 'monthly', payDate: '2026-10-05' });
    expect(incomePaydays(inc, '2026-10-01', '2026-11-01')).toEqual([
      { date: '2026-10-05', incomeId: 'job', name: 'Job', amount: 100_000 },
    ]);
  });
});

describe('nextPaydays', () => {
  it('returns [] with no incomes', () => {
    expect(nextPaydays([], '2026-10-08', 4)).toEqual([]);
  });

  it('includes today when today is a payday', () => {
    const inc = income({ frequency: 'biweekly', payDate: '2026-10-09' });
    expect(dates(nextPaydays([inc], '2026-10-09', 2))).toEqual(['2026-10-09', '2026-10-23']);
    expect(dates(nextPaydays([inc], '2026-10-10', 2))).toEqual(['2026-10-23', '2026-11-06']);
  });

  it('merges same-day paychecks from two incomes', () => {
    const a = income({ id: 'a', name: 'Job', amount: 145_000, frequency: 'biweekly', payDate: '2026-10-09' });
    const b = income({ id: 'b', name: 'Side gig', amount: 25_000, frequency: 'monthly', payDate: '2026-09-23' });
    const days = nextPaydays([a, b], '2026-10-08', 5);
    expect(dates(days)).toEqual(['2026-10-09', '2026-10-23', '2026-11-06', '2026-11-20', '2026-11-23']);
    expect(days[1].amount).toBe(170_000);
    expect(days[1].sources.map((s) => s.incomeId)).toEqual(['a', 'b']);
    expect(days[0].sources).toHaveLength(1);
    expect(days[4]).toEqual({
      date: '2026-11-23',
      amount: 25_000,
      sources: [{ date: '2026-11-23', incomeId: 'b', name: 'Side gig', amount: 25_000 }],
    });
  });

  it('finds enough paydays even for a monthly-only income', () => {
    const inc = income({ frequency: 'monthly', payDate: '2026-01-31' });
    expect(dates(nextPaydays([inc], '2026-10-08', 6))).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
    expect(nextPaydays([inc], '2026-10-08', 0)).toEqual([]);
  });
});

describe('billDueDates', () => {
  it('monthly bill due on the 31st lands on the last day of short months', () => {
    const b = bill({ dueDay: 31 });
    expect(billDueDates(b, '2026-02-01', '2026-03-01')).toEqual(['2026-02-28']);
    expect(billDueDates(b, '2026-04-01', '2026-05-01')).toEqual(['2026-04-30']);
    expect(billDueDates(b, '2028-02-01', '2028-03-01')).toEqual(['2028-02-29']);
    expect(billDueDates(b, '2026-01-01', '2026-04-01')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('monthly bills respect [start, end)', () => {
    const b = bill({ dueDay: 15 });
    expect(billDueDates(b, '2026-10-15', '2026-11-15')).toEqual(['2026-10-15']);
    expect(billDueDates(b, '2026-10-16', '2026-11-15')).toEqual([]);
  });

  it('quarterly: every 3 months from dueDate’s month, both directions', () => {
    const b = bill({ frequency: 'quarterly', dueDay: 20, dueDate: '2026-11-20' });
    expect(billDueDates(b, '2026-01-01', '2027-01-01')).toEqual([
      '2026-02-20',
      '2026-05-20',
      '2026-08-20',
      '2026-11-20',
    ]);
    expect(billDueDates(b, '2026-10-01', '2026-11-01')).toEqual([]);
    expect(billDueDates(b, '2027-02-01', '2027-03-01')).toEqual(['2027-02-20']);
  });

  it('quarterly on the 31st clamps', () => {
    const b = bill({ frequency: 'quarterly', dueDay: 31, dueDate: '2026-01-31' });
    expect(billDueDates(b, '2026-01-01', '2027-01-01')).toEqual([
      '2026-01-31',
      '2026-04-30',
      '2026-07-31',
      '2026-10-31',
    ]);
  });

  it('yearly: same month each year', () => {
    const b = bill({ frequency: 'yearly', dueDay: 10, dueDate: '2027-03-10' });
    expect(billDueDates(b, '2026-01-01', '2028-01-01')).toEqual(['2026-03-10', '2027-03-10']);
    expect(billDueDates(b, '2026-04-01', '2027-03-01')).toEqual([]);
    const leap = bill({ frequency: 'yearly', dueDay: 29, dueDate: '2028-02-29' });
    expect(billDueDates(leap, '2026-01-01', '2029-01-01')).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('weekly and biweekly bills step from dueDate (dueDay ignored)', () => {
    const w = bill({ frequency: 'weekly', dueDay: 31, dueDate: '2026-10-05' });
    expect(billDueDates(w, '2026-10-01', '2026-11-01')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    expect(billDueDates(w, '2026-11-01', '2026-12-01')).toHaveLength(5);
    const bw = bill({ frequency: 'biweekly', dueDate: '2026-12-07' });
    expect(billDueDates(bw, '2026-10-01', '2026-11-01')).toEqual(['2026-10-12', '2026-10-26']);
  });
});

describe('debtDueDates', () => {
  it('monthly on dueDay, clamped; none when paid off', () => {
    expect(debtDueDates(debt({ dueDay: 30 }), '2026-02-01', '2026-04-01')).toEqual(['2026-02-28', '2026-03-30']);
    expect(debtDueDates(debt({ balance: 0 }), '2026-02-01', '2026-04-01')).toEqual([]);
  });
});

describe('paycheckPlan', () => {
  const today = '2026-10-08';
  const make = () =>
    budget({
      incomes: [income({ id: 'job', amount: 100_000, frequency: 'biweekly', payDate: '2026-10-09' })],
      bills: [
        bill({ id: 'rent', name: 'Rent', emoji: '🏠', amount: 95_000, dueDay: 1 }),
        bill({ id: 'phone', name: 'Phone', emoji: '📱', amount: 6_000, dueDay: 12, paidMonth: '2026-10' }),
      ],
      debts: [
        debt({ id: 'card', name: 'Card', type: 'credit', minPayment: 10_000, dueDay: 23 }),
        debt({ id: 'done', name: 'Paid Off', balance: 0, minPayment: 5_000, dueDay: 10 }),
      ],
    });

  it('builds 4 windows [payday_i, payday_i+1) with items, totals and short-by', () => {
    const plan = paycheckPlan(make(), today);
    expect(plan).toHaveLength(4);
    expect(plan.map((w) => [w.payday.date, w.end])).toEqual([
      ['2026-10-09', '2026-10-23'],
      ['2026-10-23', '2026-11-06'],
      ['2026-11-06', '2026-11-20'],
      ['2026-11-20', '2026-12-04'],
    ]);
    const [w1, w2, w3, w4] = plan;
    expect(w1.items.map((i) => [i.id, i.date, i.amount, i.paid])).toEqual([['phone', '2026-10-12', 6_000, true]]);
    expect(w1.total).toBe(6_000);
    expect(w1.left).toBe(94_000);
    expect(w1.shortBy).toBe(0);
    // A payment due ON the next payday belongs to the next window.
    expect(w2.items.map((i) => [i.kind, i.id, i.date])).toEqual([
      ['debt', 'card', '2026-10-23'],
      ['bill', 'rent', '2026-11-01'],
    ]);
    expect(w2.items[0].emoji).toBe('💳');
    expect(w2.total).toBe(105_000);
    expect(w2.left).toBe(-5_000);
    expect(w2.shortBy).toBe(5_000);
    expect(w3.items.map((i) => [i.id, i.paid])).toEqual([['phone', false]]);
    expect(w4.total).toBe(105_000);
  });

  it('respects count and works when today is a payday', () => {
    const plan = paycheckPlan(make(), '2026-10-09', 2);
    expect(plan.map((w) => w.payday.date)).toEqual(['2026-10-09', '2026-10-23']);
    expect(plan[1].end).toBe('2026-11-06');
  });

  it('returns [] without income', () => {
    expect(paycheckPlan({ ...make(), incomes: [] }, today)).toEqual([]);
  });

  it('sorts items by date then name and caps the debt minimum at the balance', () => {
    const data = budget({
      incomes: [income({ frequency: 'monthly', payDate: '2026-10-01', amount: 300_000 })],
      bills: [
        bill({ name: 'Water', amount: 3_000, dueDay: 5 }),
        bill({ name: 'Internet', amount: 6_000, dueDay: 5 }),
      ],
      debts: [debt({ name: 'Almost Done', balance: 2_500, minPayment: 10_000, dueDay: 5 })],
    });
    const [w] = paycheckPlan(data, '2026-10-01', 1);
    expect(w.end).toBe('2026-11-01');
    expect(w.items.map((i) => [i.name, i.amount])).toEqual([
      ['Almost Done', 2_500],
      ['Internet', 6_000],
      ['Water', 3_000],
    ]);
    expect(w.total).toBe(11_500);
  });

  it('weekly bills show up in every window they fall in', () => {
    const data = budget({
      incomes: [income({ frequency: 'biweekly', payDate: '2026-10-09', amount: 50_000 })],
      bills: [bill({ name: 'Daycare', frequency: 'weekly', dueDate: '2026-10-05', amount: 20_000 })],
    });
    const plan = paycheckPlan(data, today);
    for (const w of plan) {
      expect(w.items).toHaveLength(2);
      expect(w.total).toBe(40_000);
      for (const it of w.items) {
        expect(compareISO(it.date, w.payday.date)).toBeGreaterThanOrEqual(0);
        expect(compareISO(it.date, w.end)).toBeLessThan(0);
      }
    }
    expect(plan[0].items.map((i) => i.date)).toEqual(['2026-10-12', '2026-10-19']);
  });
});

describe('extraPaycheckMonths', () => {
  it('biweekly: months with 3 paydays (hand-checked Fridays from 2026-10-09)', () => {
    // Oct 9, 23 · Nov 6, 20 · Dec 4, 18 · Jan 1, 15, 29 · Feb 12, 26 · Mar 12, 26 · Apr 9, 23 · May 7, 21 ·
    // Jun 4, 18 · Jul 2, 16, 30 · Aug 13, 27 · Sep 10, 24
    const inc = income({ frequency: 'biweekly', payDate: '2026-10-09' });
    expect(extraPaycheckMonths(inc, '2026-10')).toEqual([
      { month: '2027-01', count: 3 },
      { month: '2027-07', count: 3 },
    ]);
    expect(extraPaycheckMonths(inc, '2026-10', 3)).toEqual([]);
    expect(extraPaycheckMonths(inc, '2026-10', 4)).toEqual([{ month: '2027-01', count: 3 }]);
  });

  it('weekly: months with 5 paydays', () => {
    const inc = income({ frequency: 'weekly', payDate: '2026-10-09' });
    expect(extraPaycheckMonths(inc, '2026-10')).toEqual([
      { month: '2026-10', count: 5 },
      { month: '2027-01', count: 5 },
      { month: '2027-04', count: 5 },
      { month: '2027-07', count: 5 },
    ]);
  });

  it('other frequencies never have extra paychecks', () => {
    expect(extraPaycheckMonths(income({ frequency: 'monthly' }), '2026-10')).toEqual([]);
    expect(extraPaycheckMonths(income({ frequency: 'semimonthly' }), '2026-10')).toEqual([]);
  });

  it('a biweekly income has 2 or 3 paydays in every month (26 a year)', () => {
    const inc = income({ frequency: 'biweekly', payDate: '2026-01-02' });
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const start = `2026-${String(m).padStart(2, '0')}-01`;
      const end = m === 12 ? '2027-01-01' : `2026-${String(m + 1).padStart(2, '0')}-01`;
      const n = incomePaydays(inc, start, end).length;
      expect([2, 3]).toContain(n);
      total += n;
    }
    // Jan 2, 16, 30 and Jul 3, 17, 31 are the 3-payday months; the last 2026 payday is Dec 18.
    expect(total).toBe(26);
    expect(addDays('2026-12-18', 14)).toBe('2027-01-01');
  });
});

describe('semimonthlyDaysError', () => {
  it('accepts common pairs', () => {
    for (const pair of [[1, 15], [15, 31], [5, 20], [10, 25], [7, 22]] as const) {
      expect(semimonthlyDaysError(pair)).toBeNull();
    }
  });
  it('rejects the same day', () => {
    expect(semimonthlyDaysError([15, 15])).toBe('Please pick two different days.');
  });
  it('rejects days within a week, including across the month boundary and short months', () => {
    for (const pair of [[1, 5], [29, 31], [30, 31], [28, 1], [31, 1], [27, 2]] as const) {
      expect(semimonthlyDaysError(pair)).toBe('Please pick days at least a week apart.');
    }
  });
});

describe('Paycheck Plan and logged debt payments', () => {
  const nov = '2026-11-01';
  it('a debt already paid this month shows as paid; one paid off this month is still listed', () => {
    const data = budget({
      incomes: [income({ frequency: 'monthly', payDate: '2026-10-01', amount: 300_000 })],
      debts: [
        debt({ id: 'a', name: 'Card', balance: 100_000, minPayment: 5_000, dueDay: 20, monthPaid: { month: '2026-10', amount: 5_000 } }),
        debt({ id: 'b', name: 'Store', balance: 0, minPayment: 2_500, dueDay: 25, monthPaid: { month: '2026-10', amount: 2_000 } }),
      ],
    });
    const items = itemsDueBetween(data, '2026-10-01', nov);
    expect(items.find((i) => i.id === 'a')).toMatchObject({ amount: 5_000, paid: true });
    expect(items.find((i) => i.id === 'b')).toMatchObject({ amount: 2_000, paid: true });
    // Next month: the paid-off debt is gone and the other is due again.
    const next = itemsDueBetween(data, nov, '2026-12-01');
    expect(next.map((i) => [i.id, i.paid])).toEqual([['a', false]]);
  });
});
