import { describe, expect, it } from 'vitest';
import type { Debt } from '../types';
import {
  MAX_PAYOFF_MONTHS,
  compareExtra,
  interestWarnings,
  comparePayoffs,
  minimumDue,
  monthlyInterest,
  payoffOrder,
  simulatePayoff,
} from './debt';
import { debt } from './testUtils';

const start = '2026-10';

/** Independent, deliberately plain reference for ONE debt: interest then a fixed payment, never overpaying. */
function referenceSingle(balanceCents: number, aprPercent: number, payment: number) {
  let balance = balanceCents;
  let months = 0;
  let interestTotal = 0;
  let paid = 0;
  while (balance > 0 && months < 600) {
    const interest = Math.round((balance * aprPercent) / 100 / 12); // positive values: Math.round is half-up
    balance += interest;
    interestTotal += interest;
    const pay = Math.min(payment, balance);
    balance -= pay;
    paid += pay;
    months++;
  }
  return { months, interestTotal, paid };
}

describe('monthlyInterest', () => {
  it('round-half-up(balance × rateBps / 120000)', () => {
    expect(monthlyInterest(1_000_000, 600)).toBe(5_000); // $10,000 at 6% => $50
    expect(monthlyInterest(100, 600)).toBe(1); // 0.5 rounds up
    expect(monthlyInterest(99, 600)).toBe(0); // 0.495
    expect(monthlyInterest(155_000, 2400)).toBe(3_100);
    expect(monthlyInterest(240_000, 2499)).toBe(4_998);
    expect(monthlyInterest(500_000, 0)).toBe(0);
    expect(monthlyInterest(0, 2499)).toBe(0);
  });
});

describe('payoffOrder', () => {
  const a = debt({ id: 'a', name: 'Alpha', balance: 50_000, rateBps: 2000 });
  const b = debt({ id: 'b', name: 'Bravo', balance: 10_000, rateBps: 500 });
  const c = debt({ id: 'c', name: 'Charlie', balance: 30_000, rateBps: 2000 });
  const d = debt({ id: 'd', name: 'Delta', balance: 10_000, rateBps: 900 });
  const zero = debt({ id: 'z', name: 'Zero', balance: 0, rateBps: 9999 });

  it('avalanche: highest rate, then smaller balance, then name; skips paid-off debts', () => {
    expect(payoffOrder([a, b, c, d, zero], 'avalanche').map((x) => x.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('snowball: smallest balance, then higher rate, then name', () => {
    expect(payoffOrder([a, b, c, d, zero], 'snowball').map((x) => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('name breaks full ties and the input is not mutated', () => {
    const x = debt({ id: 'x', name: 'Zed', balance: 1_000, rateBps: 100 });
    const y = debt({ id: 'y', name: 'Amy', balance: 1_000, rateBps: 100 });
    const input = [x, y];
    expect(payoffOrder(input, 'snowball').map((v) => v.id)).toEqual(['y', 'x']);
    expect(payoffOrder(input, 'avalanche').map((v) => v.id)).toEqual(['y', 'x']);
    expect(input.map((v) => v.id)).toEqual(['x', 'y']);
  });
});

describe('simulatePayoff — single debt, hand-verified', () => {
  it('$10,000 at 6% paying $200/month takes 58 months (closed form 57.7)', () => {
    const closedForm = -Math.log(1 - (0.005 * 10_000) / 200) / Math.log(1.005);
    expect(closedForm).toBeCloseTo(57.68, 2);
    const r = simulatePayoff([debt({ balance: 1_000_000, rateBps: 600, minPayment: 20_000 })], {
      method: 'avalanche',
      extra: 0,
      startMonth: start,
    });
    expect(r.months).toBe(58);
    expect(r.debtFreeMonth).toBe('2031-08');
    expect(r.monthlyBudget).toBe(20_000);
    const ref = referenceSingle(1_000_000, 6, 20_000);
    expect(ref.months).toBe(58);
    expect(r.totalInterest).toBe(ref.interestTotal);
    expect(r.totalPaid).toBe(ref.paid);
    expect(r.totalPaid).toBe(1_000_000 + r.totalInterest);
    // Closed-form interest is A·n − P ≈ $1,536; cent rounding moves it by pennies at most.
    expect(Math.abs(r.totalInterest - (20_000 * closedForm - 1_000_000))).toBeLessThan(200);
    expect(r.timeline).toHaveLength(59);
    expect(r.timeline[0]).toBe(1_000_000);
    expect(r.timeline[1]).toBe(1_000_000 + 5_000 - 20_000);
    expect(r.timeline[58]).toBe(0);
    // The last payment only covers what's owed.
    const lastPayment = r.totalPaid - 57 * 20_000;
    expect(lastPayment).toBeGreaterThan(0);
    expect(lastPayment).toBeLessThan(20_000);
  });

  it('standard 60-month amortization: $10,000 at 6% => $193.33/month', () => {
    const r = simulatePayoff([debt({ balance: 1_000_000, rateBps: 600, minPayment: 19_333 })], {
      method: 'avalanche',
      extra: 0,
      startMonth: start,
    });
    expect(r.months).toBe(60);
    // Calculator: total interest ≈ $1,599.80 (60 × 193.33 − 10,000)
    expect(Math.abs(r.totalInterest - 159_980)).toBeLessThan(100);
    expect(r.totalPaid).toBe(1_000_000 + r.totalInterest);
  });

  it('matches the reference loop across many random loans', () => {
    let seed = 99;
    const rand = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    for (let i = 0; i < 200; i++) {
      const balance = 1_000 + rand(5_000_000);
      const rateBps = rand(3000);
      const interest = monthlyInterest(balance, rateBps);
      // Payment between "just above interest" and the balance (a minimum above the balance is capped; tested below).
      const payment = Math.min(balance, interest + 100 + rand(100_000));
      const r = simulatePayoff([debt({ balance, rateBps, minPayment: payment })], {
        method: 'avalanche',
        extra: 0,
        startMonth: start,
      });
      const ref = referenceSingle(balance, rateBps / 100, payment);
      expect(r.months).toBe(ref.months);
      expect(r.totalInterest).toBe(ref.interestTotal);
      expect(r.totalPaid).toBe(balance + r.totalInterest);
    }
  });

  it('0% debt: months = ceil(balance / payment), no interest', () => {
    const r = simulatePayoff([debt({ balance: 100_000, rateBps: 0, minPayment: 3_000 })], {
      method: 'avalanche',
      extra: 0,
      startMonth: start,
    });
    expect(r.months).toBe(34);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPaid).toBe(100_000);
    const exact = simulatePayoff([debt({ balance: 90_000, rateBps: 0, minPayment: 3_000 })], {
      method: 'snowball',
      extra: 0,
      startMonth: start,
    });
    expect(exact.months).toBe(30);
  });

  it('extra money is used on top of the minimum', () => {
    const r = simulatePayoff([debt({ balance: 100_000, rateBps: 0, minPayment: 3_000 })], {
      method: 'avalanche',
      extra: 2_000,
      startMonth: start,
    });
    expect(r.monthlyBudget).toBe(5_000);
    expect(r.months).toBe(20);
  });
});

describe('simulatePayoff — several debts', () => {
  // A: $1,000 at 24% (min $30) · B: $300 at 12% (min $20) · extra $50 => pool $100
  const A = debt({ id: 'A', name: 'Card', balance: 100_000, rateBps: 2400, minPayment: 3_000 });
  const B = debt({ id: 'B', name: 'Store Card', balance: 30_000, rateBps: 1200, minPayment: 2_000 });
  const opts = { extra: 5_000, startMonth: start } as const;

  it('avalanche: hand-checked first months (extra goes to the 24% card)', () => {
    const r = simulatePayoff([B, A], { ...opts, method: 'avalanche' });
    expect(r.monthlyBudget).toBe(10_000);
    // Month 1: A 100,000 + 2,000 − 3,000 − 5,000 = 94,000; B 30,000 + 300 − 2,000 = 28,300
    expect(r.timeline[1]).toBe(94_000 + 28_300);
    // Month 2: A 94,000 + 1,880 − 8,000 = 87,880; B 28,300 + 283 − 2,000 = 26,583
    expect(r.timeline[2]).toBe(87_880 + 26_583);
    expect(r.perDebt.map((p) => [p.id, p.order])).toEqual([
      ['A', 1],
      ['B', 2],
    ]);
  });

  it('snowball: hand-checked months incl. payoff and rollover (cascade in the payoff month)', () => {
    const r = simulatePayoff([A, B], { ...opts, method: 'snowball' });
    // Month 1: A 99,000; B 30,300 − 2,000 − 5,000 = 23,300
    expect(r.timeline[1]).toBe(99_000 + 23_300);
    // Month 2: A 99,000 + 1,980 − 3,000 = 97,980; B 23,300 + 233 − 7,000 = 16,533
    expect(r.timeline[2]).toBe(97_980 + 16_533);
    // Month 3: A 97,980 + 1,960 − 3,000 = 96,940; B 16,533 + 165 − 7,000 = 9,698
    expect(r.timeline[3]).toBe(96_940 + 9_698);
    // Month 4: A 96,940 + 1,939 − 3,000 = 95,879; B 9,698 + 97 − 7,000 = 2,795
    expect(r.timeline[4]).toBe(95_879 + 2_795);
    // Month 5: B 2,795 + 28 = 2,823 is paid off (2,000 min + 823), the remaining 4,177 cascades to A:
    // A 95,879 + 1,918 − 3,000 − 4,177 = 90,620
    expect(r.timeline[5]).toBe(90_620);
    // Month 6: B's freed minimum rolls over — A gets the whole $100: 90,620 + 1,812 − 10,000 = 82,432
    expect(r.timeline[6]).toBe(82_432);
    const b = r.perDebt.find((p) => p.id === 'B');
    expect(b?.months).toBe(5);
    expect(b?.payoffMonth).toBe('2027-03');
    expect(r.perDebt[0].id).toBe('B');
    expect(r.totalPaid).toBe(130_000 + r.totalInterest);
  });

  it('avalanche pays less interest than snowball here; both finish', () => {
    const av = simulatePayoff([A, B], { ...opts, method: 'avalanche' });
    const sn = simulatePayoff([A, B], { ...opts, method: 'snowball' });
    expect(av.months).not.toBeNull();
    expect(sn.months).not.toBeNull();
    expect(av.totalInterest).toBeLessThan(sn.totalInterest);
    for (const r of [av, sn]) {
      expect(r.totalPaid).toBe(130_000 + r.totalInterest);
      expect(r.perDebt.reduce((s, p) => s + p.interestPaid, 0)).toBe(r.totalInterest);
      expect(r.timeline[r.timeline.length - 1]).toBe(0);
      expect(r.timeline).toHaveLength((r.months ?? 0) + 1);
    }
  });

  it('three debts: rollover keeps the monthly pool constant until the end', () => {
    const debts: Debt[] = [
      debt({ id: 'car', name: 'Car', balance: 500_000, rateBps: 590, minPayment: 15_000 }),
      debt({ id: 'card', name: 'Card', balance: 150_000, rateBps: 2499, minPayment: 4_500 }),
      debt({ id: 'school', name: 'School', balance: 900_000, rateBps: 680, minPayment: 10_000 }),
    ];
    const r = simulatePayoff(debts, { method: 'avalanche', extra: 10_000, startMonth: start });
    expect(r.monthlyBudget).toBe(39_500);
    expect(r.perDebt.map((p) => p.id)).toEqual(['card', 'car', 'school']);
    expect(r.perDebt.map((p) => p.order)).toEqual([1, 3, 2]);
    // Every month except the last pays exactly the pool: balance drop + interest == pool.
    const months = r.months ?? 0;
    expect(months).toBeGreaterThan(0);
    expect(r.totalPaid).toBe(1_550_000 + r.totalInterest);
    expect(r.totalPaid).toBeLessThanOrEqual(months * 39_500);
    expect(r.totalPaid).toBeGreaterThan((months - 1) * 39_500);
    expect(r.debtFreeMonth).toBe(r.perDebt[2].payoffMonth);
    // Payoff months are non-decreasing in the result order.
    const ms = r.perDebt.map((p) => p.months ?? Infinity);
    expect([...ms].sort((x, y) => x - y)).toEqual(ms);
  });

  it('no debts (or only paid-off ones) => 0 months, debt-free now', () => {
    for (const debts of [[], [debt({ balance: 0 })]]) {
      const r = simulatePayoff(debts, { method: 'avalanche', extra: 5_000, startMonth: start });
      expect(r.months).toBe(0);
      expect(r.debtFreeMonth).toBe(start);
      expect(r.totalInterest).toBe(0);
      expect(r.totalPaid).toBe(0);
      expect(r.perDebt).toEqual([]);
      expect(r.timeline).toEqual([0]);
      expect(r.monthlyBudget).toBe(5_000);
    }
  });

  it('a minimum larger than the balance never overpays', () => {
    const r = simulatePayoff([debt({ balance: 2_000, rateBps: 1200, minPayment: 5_000 })], {
      method: 'avalanche',
      extra: 0,
      startMonth: start,
    });
    // pool = min(5,000, 2,000) = 2,000; month 1 balance 2,020 => pays 2,000; month 2 pays 20 (+0 interest)
    expect(r.monthlyBudget).toBe(2_000);
    expect(r.months).toBe(2);
    expect(r.totalInterest).toBe(20);
    expect(r.totalPaid).toBe(2_020);
  });
});

describe('never paying off', () => {
  const stuck = debt({ id: 's', name: 'Card', balance: 155_000, rateBps: 2400, minPayment: 2_500 });

  it('min ≤ interest => months null and the balance grows', () => {
    const r = simulatePayoff([stuck], { method: 'avalanche', extra: 0, startMonth: start });
    expect(r.months).toBeNull();
    expect(r.debtFreeMonth).toBeNull();
    expect(r.perDebt[0].months).toBeNull();
    expect(r.perDebt[0].payoffMonth).toBeNull();
    expect(r.timeline).toHaveLength(MAX_PAYOFF_MONTHS + 1);
    expect(r.timeline[1]).toBe(155_000 + 3_100 - 2_500);
    expect(r.timeline[MAX_PAYOFF_MONTHS]).toBeGreaterThan(r.timeline[0]);
  });

  it('min == interest => flat balance, still never', () => {
    const flat = debt({ balance: 100_000, rateBps: 2400, minPayment: 2_000 });
    const r = simulatePayoff([flat], { method: 'avalanche', extra: 0, startMonth: start });
    expect(r.months).toBeNull();
    expect(r.totalInterest).toBe(600 * 2_000);
    expect(r.timeline.every((b) => b === 100_000)).toBe(true);
    expect(interestWarnings([flat])).toHaveLength(1);
  });

  it('interestWarnings flags it with the numbers for the message', () => {
    expect(interestWarnings([stuck])).toEqual([
      { debtId: 's', name: 'Card', kind: 'grows', monthlyInterest: 3_100, minPayment: 2_500 },
    ]);
    expect(interestWarnings([{ ...stuck, minPayment: 3_101 }])).toEqual([]);
    expect(interestWarnings([{ ...stuck, rateBps: 0, minPayment: 2_500 }])).toEqual([]);
    expect(interestWarnings([{ ...stuck, balance: 0 }])).toEqual([]);
    expect(interestWarnings([{ ...stuck, balance: 0, minPayment: 0 }])).toEqual([]);
  });

  it('interestWarnings tells growing, flat and no-payment debts apart', () => {
    // $1,550 at 24% => $31 of interest a month.
    expect(interestWarnings([{ ...stuck, minPayment: 3_099 }])[0].kind).toBe('grows');
    expect(interestWarnings([{ ...stuck, minPayment: 3_100 }])).toEqual([
      { debtId: 's', name: 'Card', kind: 'flat', monthlyInterest: 3_100, minPayment: 3_100 },
    ]);
    // No minimum at all: a 0% debt that never gets paid down, and a card with interest but no payment.
    expect(interestWarnings([{ ...stuck, rateBps: 0, minPayment: 0 }])).toEqual([
      { debtId: 's', name: 'Card', kind: 'no-payment', monthlyInterest: 0, minPayment: 0 },
    ]);
    expect(interestWarnings([{ ...stuck, minPayment: 0 }])[0]).toMatchObject({ kind: 'no-payment', monthlyInterest: 3_100 });
  });

  it('interestWarnings keeps the order the debts were given in', () => {
    const a = debt({ id: 'a', name: 'Zed', balance: 50_000, rateBps: 0, minPayment: 0 });
    const b = debt({ id: 'b', name: 'Amy', balance: 155_000, rateBps: 2400, minPayment: 3_100 });
    const fine = debt({ id: 'c', name: 'Fine', balance: 10_000, rateBps: 500, minPayment: 1_000 });
    expect(interestWarnings([a, fine, b, stuck]).map((w) => [w.debtId, w.kind])).toEqual([
      ['a', 'no-payment'],
      ['b', 'flat'],
      ['s', 'grows'],
    ]);
  });

  it('extra makes it finite', () => {
    const r = simulatePayoff([stuck], { method: 'avalanche', extra: 1_000, startMonth: start });
    expect(r.months).not.toBeNull();
    expect(r.totalPaid).toBe(155_000 + r.totalInterest);
  });

  it('respects a custom maxMonths', () => {
    const r = simulatePayoff([debt({ balance: 1_000_000, rateBps: 600, minPayment: 20_000 })], {
      method: 'avalanche',
      extra: 0,
      startMonth: start,
      maxMonths: 12,
    });
    expect(r.months).toBeNull();
    expect(r.timeline).toHaveLength(13);
  });

  it('a stuck debt gets paid once the others are gone (rollover)', () => {
    const small = debt({ id: 'small', name: 'Small', balance: 10_000, rateBps: 0, minPayment: 5_000 });
    const r = simulatePayoff([stuck, small], { method: 'snowball', extra: 0, startMonth: start });
    expect(r.months).not.toBeNull();
    expect(r.perDebt.map((p) => p.id)).toEqual(['small', 's']);
    expect(r.perDebt[0].months).toBe(2);
  });
});

describe('minimumDue', () => {
  it('is min(minimum, balance), never negative', () => {
    expect(minimumDue(5_000, 200_000)).toBe(5_000);
    expect(minimumDue(5_000, 2_000)).toBe(2_000);
    expect(minimumDue(5_000, 0)).toBe(0);
    expect(minimumDue(0, 2_000)).toBe(0);
  });
});

describe('compareExtra', () => {
  const loan = debt({ balance: 1_000_000, rateBps: 600, minPayment: 20_000 });

  it('comparePayoffs gives the same answer from two runs already made', () => {
    const base = simulatePayoff([loan], { method: 'avalanche', extra: 0, startMonth: start });
    const more = simulatePayoff([loan], { method: 'avalanche', extra: 10_000, startMonth: start });
    expect(comparePayoffs(base, more)).toEqual(compareExtra([loan], 'avalanche', 0, 10_000, start));
  });

  it('reports months sooner and interest saved', () => {
    const c = compareExtra([loan], 'avalanche', 0, 10_000, start);
    expect(c.base.months).toBe(58);
    // $300/month: −ln(1 − 0.005·10000/300)/ln(1.005) = 36.6 => 37 months
    expect(c.withExtra.months).toBe(37);
    expect(c.monthsSooner).toBe(21);
    expect(c.interestSaved).toBe(c.base.totalInterest - c.withExtra.totalInterest);
    expect(c.interestSaved).toBeGreaterThan(50_000);
  });

  it('same extra => 0 sooner, 0 saved; less extra never reports negative savings', () => {
    const same = compareExtra([loan], 'avalanche', 5_000, 5_000, start);
    expect(same.monthsSooner).toBe(0);
    expect(same.interestSaved).toBe(0);
    const less = compareExtra([loan], 'avalanche', 10_000, 0, start);
    expect(less.monthsSooner).toBe(-21);
    expect(less.interestSaved).toBe(0);
  });

  it('monthsSooner is null when the base never pays off', () => {
    const stuck = debt({ balance: 155_000, rateBps: 2400, minPayment: 2_500 });
    const c = compareExtra([stuck], 'avalanche', 0, 5_000, start);
    expect(c.base.months).toBeNull();
    expect(c.withExtra.months).not.toBeNull();
    expect(c.monthsSooner).toBeNull();
  });

  it('no debts', () => {
    const c = compareExtra([], 'snowball', 0, 10_000, start);
    expect(c.monthsSooner).toBe(0);
    expect(c.interestSaved).toBe(0);
  });
});
