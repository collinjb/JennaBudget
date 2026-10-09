import { describe, expect, it } from 'vitest';
import { roundDiv } from './money';
import { billsForMonth, homeBreakdown, monthlySummary, type MonthlySummary } from './summary';
import { bill, budget, debt, goal, income, spending } from './testUtils';

const TODAY = '2026-10-08';

function sample() {
  return budget({
    incomes: [
      income({ amount: 145_000, frequency: 'biweekly' }), // 314,167
      income({ amount: 50_000, frequency: 'semimonthly' }), // 100,000
    ],
    bills: [
      bill({ amount: 90_000, frequency: 'monthly' }),
      bill({ name: 'Prime', amount: 13_900, frequency: 'yearly', dueDate: '2027-03-10' }), // 1,158
      bill({ name: 'Insurance', amount: 36_000, frequency: 'quarterly', dueDate: '2026-11-20' }), // 12,000
    ],
    debts: [
      debt({ balance: 200_000, minPayment: 5_000 }),
      debt({ name: 'Nearly done', balance: 2_500, minPayment: 10_000 }), // counts 2,500
      debt({ name: 'Paid off', balance: 0, minPayment: 7_000 }), // ignored
    ],
    spending: [
      spending({ monthly: 30_000, kind: 'need' }),
      spending({ name: 'Gas', monthly: 12_050, kind: 'need' }),
      spending({ name: 'Fun', monthly: 15_000, kind: 'fun' }),
    ],
    goals: [
      goal({ monthly: 10_000, saved: 0, target: 150_000 }),
      goal({ name: 'Done', monthly: 5_000, saved: 100_000, target: 100_000 }), // reached: excluded
      goal({ name: 'EF', monthly: 20_000, saved: 50_000, target: 100_000, isEmergencyFund: true }),
    ],
    settings: { extraDebtPayment: 5_000 },
  });
}

describe('monthlySummary', () => {
  it('adds everything up', () => {
    expect(monthlySummary(sample(), TODAY)).toEqual({
      income: 414_167,
      bills: 103_158,
      debtMinimums: 7_500,
      debtExtra: 5_000,
      debt: 12_500,
      spendingNeeds: 42_050,
      spendingFun: 15_000,
      spending: 57_050,
      savings: 30_000,
      outgo: 202_708,
      leftOver: 211_459,
    });
  });

  it('left over = income - outgo and outgo = bills + debt + spending + savings', () => {
    const s = monthlySummary(sample(), TODAY);
    expect(s.outgo).toBe(s.bills + s.debt + s.spending + s.savings);
    expect(s.leftOver).toBe(s.income - s.outgo);
  });

  it('counts extra only while some debt has a balance', () => {
    const data = sample();
    data.debts = data.debts.map((d) => ({ ...d, balance: 0 }));
    const s = monthlySummary(data, TODAY);
    expect(s.debtMinimums).toBe(0);
    expect(s.debtExtra).toBe(0);
    expect(s.debt).toBe(0);
  });

  it('caps each minimum at the balance', () => {
    const s = monthlySummary(budget({ debts: [debt({ balance: 1_234, minPayment: 5_000 })] }), TODAY);
    expect(s.debtMinimums).toBe(1_234);
  });

  it('excludes reached goals (including target 0) from savings', () => {
    const s = monthlySummary(
      budget({
        goals: [
          goal({ monthly: 5_000, saved: 200_000, target: 150_000 }),
          goal({ monthly: 7_000, saved: 0, target: 0 }),
          goal({ monthly: 1_100, saved: 149_999, target: 150_000 }),
        ],
      }), TODAY
    );
    expect(s.savings).toBe(1_100);
  });

  it('empty budget is all zeros', () => {
    const s = monthlySummary(budget(), TODAY);
    expect(Object.values(s).every((v) => v === 0)).toBe(true);
  });
});

describe('homeBreakdown', () => {
  it('parts are whole dollars and sum to the whole-dollar income', () => {
    const s = monthlySummary(sample(), TODAY);
    const h = homeBreakdown(s);
    expect(h.over).toBe(false);
    expect(h.parts.map((p) => p.key)).toEqual(['bills', 'debt', 'savings', 'spending', 'leftOver']);
    expect(h.parts.map((p) => p.cents)).toEqual([103_200, 12_500, 30_000, 57_000, 211_500]);
    expect(h.income).toBe(414_200);
    expect(h.leftOver).toBe(211_500);
    expect(h.parts.reduce((t, p) => t + p.cents, 0)).toBe(h.income);
  });

  it('property: parts always sum to income when not over', () => {
    let seed = 7;
    const r = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    for (let i = 0; i < 1000; i++) {
      const bills = r(300_000);
      const debtV = r(100_000);
      const savings = r(100_000);
      const spendingV = r(100_000);
      const leftOver = r(200_000);
      const s: MonthlySummary = {
        income: bills + debtV + savings + spendingV + leftOver,
        bills,
        debtMinimums: debtV,
        debtExtra: 0,
        debt: debtV,
        spendingNeeds: spendingV,
        spendingFun: 0,
        spending: spendingV,
        savings,
        outgo: bills + debtV + savings + spendingV,
        leftOver,
      };
      const h = homeBreakdown(s);
      expect(h.over).toBe(false);
      expect(h.parts.reduce((t, p) => t + p.cents, 0)).toBe(h.income);
      expect(h.income).toBe(roundDiv(s.income, 100) * 100);
      expect(h.parts.every((p) => p.cents % 100 === 0)).toBe(true);
      expect(h.leftOver).toBe(h.parts[4].cents);
    }
  });

  it('over budget: left-over part is 0 and leftOver = whole income - whole outgo', () => {
    const s = monthlySummary(
      budget({
        incomes: [income({ frequency: 'monthly', amount: 100_000 })],
        bills: [bill({ amount: 90_050 })],
        spending: [spending({ monthly: 20_000 })],
      }), TODAY
    );
    expect(s.leftOver).toBe(-10_050);
    const h = homeBreakdown(s);
    expect(h.over).toBe(true);
    expect(h.parts.map((p) => p.cents)).toEqual([90_100, 0, 0, 20_000, 0]);
    expect(h.income).toBe(100_000);
    expect(h.leftOver).toBe(-10_100);
    const outgo = h.parts.reduce((t, p) => t + p.cents, 0);
    expect(h.income - outgo).toBe(h.leftOver);
  });

  it('over by a few cents still shows at least $1 over', () => {
    const s = monthlySummary(
      budget({ incomes: [income({ frequency: 'monthly', amount: 100_000 })], bills: [bill({ amount: 100_030 })] }), TODAY
    );
    const h = homeBreakdown(s);
    expect(h.over).toBe(true);
    expect(h.leftOver).toBe(-100);
    // ...and the shown parts still add up: bills rounds up to $1,001 against $1,000 take-home.
    expect(h.parts.map((p) => p.cents)).toEqual([100_100, 0, 0, 0, 0]);
    expect(h.income - h.parts.reduce((t, p) => t + p.cents, 0)).toBe(h.leftOver);
  });

  it('property: over-budget parts always equal income + overage', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    for (let i = 0; i < 500; i++) {
      const pay = 50_000 + rand(500_000);
      const s = monthlySummary(
        budget({
          incomes: [income({ frequency: 'monthly', amount: pay })],
          bills: [bill({ amount: pay - 500 + rand(1_000) }), bill({ id: 'b2', amount: rand(5_000) })],
          spending: [spending({ monthly: rand(3_000) })],
        }), TODAY
      );
      const h = homeBreakdown(s);
      if (!h.over) continue;
      expect(h.leftOver).toBeLessThanOrEqual(-100);
      expect(h.income - h.parts.reduce((t, p) => t + p.cents, 0)).toBe(h.leftOver);
    }
  });

  it('exactly zero left over is not over', () => {
    const s = monthlySummary(
      budget({ incomes: [income({ frequency: 'monthly', amount: 100_000 })], bills: [bill({ amount: 100_000 })] }), TODAY
    );
    const h = homeBreakdown(s);
    expect(h.over).toBe(false);
    expect(h.leftOver).toBe(0);
  });
});

describe('billsForMonth', () => {
  const data = budget({
    bills: [
      bill({ id: 'rent', name: 'Rent', amount: 90_000, dueDay: 1, paidMonth: '2026-10' }),
      bill({ id: 'phone', name: 'Phone', amount: 6_000, dueDay: 12, paidMonth: '2026-09' }), // last month: reset
      bill({ id: 'netflix', name: 'Netflix', amount: 1_549, dueDay: 12 }),
      bill({ id: 'ins', name: 'Car Insurance', amount: 36_000, frequency: 'quarterly', dueDay: 20, dueDate: '2026-11-20' }),
      bill({ id: 'daycare', name: 'Daycare', amount: 20_000, frequency: 'weekly', dueDate: '2026-10-05' }),
      bill({ id: 'prime', name: 'Prime', amount: 13_900, frequency: 'yearly', dueDay: 10, dueDate: '2027-03-10' }),
    ],
  });

  it('orders due bills by date then name, then not-due by name', () => {
    const m = billsForMonth(data, '2026-10');
    expect(m.items.map((i) => i.bill.id)).toEqual(['rent', 'daycare', 'netflix', 'phone', 'ins', 'prime']);
    expect(m.items.map((i) => i.dueThisMonth)).toEqual([true, true, true, true, false, false]);
  });

  it('counts paid and money left, ignoring bills not due this month', () => {
    const m = billsForMonth(data, '2026-10');
    expect(m.dueCount).toBe(4);
    expect(m.paidCount).toBe(1);
    expect(m.totalThisMonth).toBe(90_000 + 4 * 20_000 + 1_549 + 6_000);
    expect(m.leftToPay).toBe(4 * 20_000 + 1_549 + 6_000);
    const daycare = m.items.find((i) => i.bill.id === 'daycare');
    expect(daycare?.dueDates).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(daycare?.amountThisMonth).toBe(80_000);
    expect(m.items.find((i) => i.bill.id === 'phone')?.paid).toBe(false);
    expect(m.items.find((i) => i.bill.id === 'ins')?.amountThisMonth).toBe(0);
  });

  it('paid status resets automatically in a new month and quarterly bills come due', () => {
    const m = billsForMonth(data, '2026-11');
    expect(m.paidCount).toBe(0);
    expect(m.dueCount).toBe(5);
    expect(m.items.find((i) => i.bill.id === 'ins')?.dueDates).toEqual(['2026-11-20']);
    expect(m.items.find((i) => i.bill.id === 'daycare')?.dueDates).toHaveLength(5);
    expect(m.leftToPay).toBe(m.totalThisMonth);
  });

  it('marks everything paid', () => {
    const allPaid = { ...data, bills: data.bills.map((b) => ({ ...b, paidMonth: '2026-10' })) };
    const m = billsForMonth(allPaid, '2026-10');
    expect(m.paidCount).toBe(m.dueCount);
    expect(m.leftToPay).toBe(0);
  });

  it('empty', () => {
    expect(billsForMonth(budget(), '2026-10')).toEqual({
      items: [],
      dueCount: 0,
      paidCount: 0,
      leftToPay: 0,
      totalThisMonth: 0,
    });
  });
});

describe('monthlySummary: dates and this month', () => {
  it('a goal with a target date sets aside its automatic amount, not its monthly field', () => {
    const s = monthlySummary(
      budget({ goals: [goal({ target: 120_000, saved: 0, monthly: 1, targetDate: '2027-09-30' })] }),
      TODAY,
    );
    expect(s.savings).toBe(10_000); // $1,200 over 12 months
  });

  it("paying a debt down during the month does not change this month's budget", () => {
    const atStart = monthlySummary(budget({ debts: [debt({ balance: 3_000, minPayment: 5_000 })] }), TODAY);
    const paidOff = monthlySummary(
      budget({ debts: [debt({ balance: 0, minPayment: 5_000, monthPaid: { month: '2026-10', amount: 3_000 } })] }),
      TODAY,
    );
    expect(paidOff.debtMinimums).toBe(atStart.debtMinimums);
    expect(paidOff.debtMinimums).toBe(3_000);
    // Next month it's gone.
    const nextMonth = monthlySummary(
      budget({ debts: [debt({ balance: 0, minPayment: 5_000, monthPaid: { month: '2026-10', amount: 3_000 } })] }),
      '2026-11-02',
    );
    expect(nextMonth.debtMinimums).toBe(0);
  });
});
