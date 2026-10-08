import { describe, expect, it } from 'vitest';
import type { BudgetData, Goal } from '../types';
import { PLAN_CONFIG } from './planConfig';
import {
  MAX_PLAN_AMOUNT,
  PLAN_WHY,
  applySmartPlan,
  buildSmartPlan,
  smallestExtraToFinish,
  splitByWeight,
  splitEquallyWithCaps,
  type SmartPlan,
} from './smartPlan';
import { simulatePayoff } from './debt';
import { MAX_MONEY_CENTS } from './money';
import { monthlySummary } from './summary';
import { bill, budget, debt, goal, income, spending } from './testUtils';

const today = '2026-10-08';

const pay = (amount: number) => income({ frequency: 'monthly', amount, payDate: '2026-10-01' });
const fullEF = (over: Partial<Goal> = {}) =>
  goal({ id: 'ef', name: 'Emergency Fund', emoji: '🛟', target: 100_000, saved: 100_000, isEmergencyFund: true, ...over });

function line(plan: SmartPlan, nameOrId: string) {
  const l = plan.lines.find((x) => x.id === nameOrId || x.name === nameOrId);
  if (!l) throw new Error(`no line ${nameOrId} in ${plan.lines.map((x) => x.name).join(', ')}`);
  return l;
}

/** Invariants every feasible plan must satisfy. */
function checkInvariants(data: BudgetData, plan: SmartPlan) {
  if (!plan.feasible) {
    expect(plan.lines).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.hasSuggestions).toBe(false);
    expect(plan.shortfall).toBeGreaterThan(0);
    expect(plan.levers.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < plan.levers.length; i++) {
      expect(plan.levers[i - 1].monthly).toBeGreaterThanOrEqual(plan.levers[i].monthly);
    }
    return;
  }
  expect(plan.shortfall).toBe(0);
  expect(plan.leftOverAfter).toBeGreaterThanOrEqual(0);
  for (const l of plan.lines) {
    expect(l.to % 100).toBe(0);
    expect(l.to).toBeGreaterThanOrEqual(0);
    expect(l.why.length).toBeGreaterThan(10);
    expect(l.why).not.toMatch(/\b(APR|allocation|amortization|zero-based)\b/i);
  }
  // Every line that moves is listed; the Home nudge only fires for $5+ moves or new items.
  const isNew = (c: SmartPlan['changes'][number]) => c.kind === 'newGoal' || c.kind === 'newSpending';
  for (const c of plan.changes) expect(isNew(c) || c.to !== c.from).toBe(true);
  for (const l of plan.lines) if (!plan.changes.includes(l)) expect(l.to).toBe(l.from);
  expect(plan.hasSuggestions).toBe(plan.changes.some((c) => isNew(c) || Math.abs(c.to - c.from) >= PLAN_CONFIG.MIN_CHANGE));
  const before = JSON.stringify(data);
  const applied = applySmartPlan(data, plan);
  expect(JSON.stringify(data)).toBe(before); // never mutates
  expect(monthlySummary(applied).leftOver).toBe(plan.leftOverAfter);
  const again = buildSmartPlan(applied, today);
  expect(again.changes).toEqual([]);
  expect(again.hasSuggestions).toBe(false);
  expect(again.newGoal).toBeNull();
  expect(again.newSpending).toBeNull();
  expect(again.leftOverAfter).toBe(plan.leftOverAfter);
  expect(again.lines.map((l) => l.to)).toEqual(
    plan.lines.map((l) => l.to), // same amounts, same order (new items are appended to the end of their lists)
  );
}

describe('infeasible: bills + minimums + must-haves exceed income', () => {
  const data = budget({
    incomes: [pay(200_000)],
    bills: [
      bill({ name: 'Rent', emoji: '🏠', amount: 150_000 }),
      bill({ name: 'Phone', emoji: '📱', amount: 8_000 }),
      bill({ name: 'Internet', amount: 6_000 }),
      bill({ name: 'Gym', amount: 4_000 }),
      bill({ name: 'Netflix', amount: 1_500 }),
    ],
    debts: [debt({ balance: 100_000, minPayment: 5_000 })],
    spending: [
      spending({ name: 'Groceries', emoji: '🛒', monthly: 40_000, kind: 'need' }),
      spending({ name: 'Gas', emoji: '⛽', monthly: 15_000, kind: 'need' }),
      spending({ name: 'Fun', monthly: 10_000, kind: 'fun' }),
    ],
    goals: [goal({ name: 'Trip', monthly: 5_000 })],
  });
  const plan = buildSmartPlan(data, today);

  it('reports the shortfall honestly and changes nothing', () => {
    expect(plan.feasible).toBe(false);
    expect(plan.shortfall).toBe(29_500); // 200,000 − (169,500 + 5,000 + 55,000)
    expect(plan.lines).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.hasSuggestions).toBe(false);
    expect(plan.newGoal).toBeNull();
    expect(plan.newSpending).toBeNull();
    expect(plan.leftOverBefore).toBe(monthlySummary(data).leftOver);
    expect(plan.leftOverAfter).toBe(plan.leftOverBefore);
  });

  it('lists the 4 biggest bills / must-haves with plain tips', () => {
    expect(plan.levers).toEqual([
      { name: 'Rent', emoji: '🏠', monthly: 150_000, tip: 'Could you lower, switch, or cancel this?' },
      { name: 'Groceries', emoji: '🛒', monthly: 40_000, tip: 'Even a small trim here helps.' },
      { name: 'Gas', emoji: '⛽', monthly: 15_000, tip: 'Even a small trim here helps.' },
      { name: 'Phone', emoji: '📱', monthly: 8_000, tip: 'Could you lower, switch, or cancel this?' },
    ]);
  });

  it('impact before = after', () => {
    expect(plan.impact.debtFreeAfter).toBe(plan.impact.debtFreeBefore);
    expect(plan.impact.monthsAfter).toBe(plan.impact.monthsBefore);
    expect(plan.impact.interestAfter).toBe(plan.impact.interestBefore);
    expect(plan.impact.goals).toHaveLength(1);
    expect(plan.impact.goals[0].before).toBe(plan.impact.goals[0].after);
  });

  it('applying an infeasible plan changes nothing', () => {
    const applied = applySmartPlan(data, plan);
    expect(applied).toEqual(data);
    expect(applied).not.toBe(data);
  });

  it('uses the monthly equivalent of non-monthly bills for levers', () => {
    const bills = [bill({ name: 'Insurance', amount: 120_000, frequency: 'yearly', dueDate: '2027-01-01' })];
    const short = buildSmartPlan(budget({ incomes: [pay(9_999)], bills }), today);
    expect(short.feasible).toBe(false);
    expect(short.shortfall).toBe(1);
    expect(short.levers).toEqual([{ name: 'Insurance', emoji: '🏠', monthly: 10_000, tip: PLAN_WHY.leverBill }]);
    expect(buildSmartPlan(budget({ incomes: [pay(10_000)], bills }), today).feasible).toBe(true); // exactly covered
  });
});

describe('comfortable budget with nothing set up yet', () => {
  // income $5,000, bills $1,500, must-haves $500 => fixed $2,000, free $3,000
  const data = budget({
    incomes: [pay(500_000)],
    bills: [bill({ amount: 150_000 })],
    spending: [spending({ monthly: 50_000, kind: 'need' })],
  });
  const plan = buildSmartPlan(data, today);

  it('creates a safety net: max($1,000, one month of fixed costs rounded up to $100)', () => {
    expect(plan.newGoal).toMatchObject({
      name: 'Emergency Fund',
      emoji: '🛟',
      target: 200_000,
      saved: 0,
      monthly: 120_000, // min($2,000 left to save, 40% × $3,000)
      targetDate: null,
      isEmergencyFund: true,
    });
    expect(plan.newGoal?.id).toBeTruthy();
    const ef = plan.lines[0];
    expect(ef).toMatchObject({ kind: 'newGoal', id: null, from: 0, to: 120_000 });
    expect(ef.why).toBe('A $2,000 safety net keeps a surprise, like a car repair, from turning into new debt.');
  });

  it('adds Fun Money at 10% of take-home', () => {
    expect(plan.newSpending).toMatchObject({ name: 'Fun Money', emoji: '🎉', monthly: 50_000, kind: 'fun' });
    const fun = line(plan, 'Fun Money');
    expect(fun.kind).toBe('newSpending');
    expect(fun.to).toBe(50_000);
    expect(fun.why).toBe(PLAN_WHY.fun);
  });

  it('explains a fun-money cut differently from a raise', () => {
    const data = budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 100_000 })],
      spending: [spending({ id: 'fun', name: 'Fun', monthly: 200_000, kind: 'fun' })],
    });
    const cut = buildSmartPlan(data, today);
    expect(line(cut, 'fun').to).toBeLessThan(200_000);
    expect(line(cut, 'fun').why).toBe(PLAN_WHY.funTrimmed);
  });

  it('no debts and no goals: the rest stays as left over; no extra-debt line', () => {
    expect(plan.lines.map((l) => l.kind)).toEqual(['newGoal', 'newSpending']);
    expect(plan.leftOverAfter).toBe(130_000);
    expect(plan.changes).toHaveLength(2);
    expect(plan.hasSuggestions).toBe(true);
    expect(plan.impact.monthsBefore).toBe(0);
    expect(plan.impact.goals).toEqual([
      { id: plan.newGoal?.id, name: 'Emergency Fund', emoji: '🛟', before: null, after: '2026-12' },
    ]);
  });

  it('apply adds the new items, and rebuilding finds nothing to change', () => {
    const applied = applySmartPlan(data, plan);
    expect(applied.goals).toHaveLength(1);
    expect(applied.goals[0]).toEqual(plan.newGoal);
    expect(applied.spending[1]).toEqual(plan.newSpending);
    expect(monthlySummary(applied).leftOver).toBe(130_000);
    checkInvariants(data, plan);
  });

  it('starter safety net is at least $1,000', () => {
    const small = budget({ incomes: [pay(300_000)], bills: [bill({ amount: 40_000 })] });
    const p = buildSmartPlan(small, today);
    expect(p.newGoal?.target).toBe(100_000);
    expect(p.lines[0].why).toBe(PLAN_WHY.newSafetyNet(100_000));
    expect(p.lines[0].why).toContain('$1,000');
  });

  it('rounds one month of fixed costs UP to the next $100', () => {
    const d = budget({ incomes: [pay(500_000)], bills: [bill({ amount: 160_049 })] });
    expect(buildSmartPlan(d, today).newGoal?.target).toBe(170_000);
  });
});

describe('tight vs comfortable fun money', () => {
  it('tight (free money < 15% of income): fun is 5% of take-home, capped at half of free money', () => {
    // income $3,000, fixed $2,600 => free $400 (13%) => tight
    const data = budget({
      incomes: [pay(300_000)],
      bills: [bill({ amount: 200_000 })],
      spending: [spending({ monthly: 60_000, kind: 'need' })],
    });
    const plan = buildSmartPlan(data, today);
    // EF: min($2,600, 40% × $400 = $160) => $160; free $240
    expect(plan.newGoal?.monthly).toBe(16_000);
    // fun: min(5% × $3,000 = $150, 50% × $240 = $120) => $120
    expect(line(plan, 'Fun Money').to).toBe(12_000);
    expect(line(plan, 'Fun Money').why).toBe(PLAN_WHY.funTight);
    expect(plan.leftOverAfter).toBe(12_000);
    checkInvariants(data, plan);
  });

  it('exactly 15% free is NOT tight; one cent less is', () => {
    const at = budget({ incomes: [pay(400_000)], bills: [bill({ amount: 340_000 })] });
    const below = budget({ incomes: [pay(400_000)], bills: [bill({ amount: 340_001 })] });
    expect(line(buildSmartPlan(at, today), 'Fun Money').why).toBe(PLAN_WHY.fun);
    expect(line(buildSmartPlan(below, today), 'Fun Money').why).toBe(PLAN_WHY.funTight);
  });

  it('comfortable fun is capped by income share; tight fun is smaller', () => {
    const comfy = buildSmartPlan(budget({ incomes: [pay(400_000)], bills: [bill({ amount: 100_000 })] }), today);
    const tight = buildSmartPlan(budget({ incomes: [pay(400_000)], bills: [bill({ amount: 345_000 })] }), today);
    expect(line(comfy, 'Fun Money').to).toBe(40_000);
    expect(line(tight, 'Fun Money').to).toBeLessThan(line(comfy, 'Fun Money').to);
    expect(line(tight, 'Fun Money').to).toBeLessThanOrEqual(20_000);
  });

  it('splits fun across existing fun categories in proportion (largest remainder)', () => {
    const data = budget({
      incomes: [pay(400_000)],
      bills: [bill({ amount: 100_000 })],
      spending: [
        spending({ id: 'fun', name: 'Fun Money', monthly: 10_000, kind: 'fun' }),
        spending({ id: 'eat', name: 'Eating Out', monthly: 5_000, kind: 'fun' }),
        spending({ id: 'food', name: 'Groceries', monthly: 50_000, kind: 'need' }),
      ],
      goals: [fullEF()],
    });
    // fixed $1,500, free $2,500, EF full => fun = min($400, $1,250) = $400 split 2:1 => 266.67 / 133.33 => 267 / 133
    const plan = buildSmartPlan(data, today);
    expect(line(plan, 'fun').to).toBe(26_700);
    expect(line(plan, 'eat').to).toBe(13_300);
    expect(plan.lines.some((l) => l.id === 'food')).toBe(false); // must-haves are never touched
    expect(plan.newSpending).toBeNull();
    checkInvariants(data, plan);
  });

  it('splits equally when every fun category is at $0', () => {
    const data = budget({
      incomes: [pay(200_000)],
      spending: [
        spending({ id: 'a', name: 'A', monthly: 0, kind: 'fun' }),
        spending({ id: 'b', name: 'B', monthly: 0, kind: 'fun' }),
        spending({ id: 'c', name: 'C', monthly: 0, kind: 'fun' }),
      ],
      goals: [fullEF()],
    });
    // fun = min(10% × $2,000 = $200, 50% × $2,000) = $200 => 67 / 67 / 66
    const plan = buildSmartPlan(data, today);
    expect(['a', 'b', 'c'].map((id) => line(plan, id).to)).toEqual([6_700, 6_700, 6_600]);
    checkInvariants(data, plan);
  });
});

describe('safety net', () => {
  it('existing safety net in progress gets up to 40% of free money, capped at what is left', () => {
    const data = budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 200_000 })],
      goals: [goal({ id: 'ef', name: 'Rainy Day', target: 150_000, saved: 100_000, monthly: 10_000, isEmergencyFund: true })],
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.newGoal).toBeNull();
    // min($500 left, 40% × $3,000) => $500
    expect(line(plan, 'ef')).toMatchObject({ kind: 'goal', from: 10_000, to: 50_000, why: PLAN_WHY.safetyNetBuilding });
    checkInvariants(data, plan);
  });

  it('rounds a cents remainder up to whole dollars', () => {
    const data = budget({
      incomes: [pay(500_000)],
      goals: [goal({ id: 'ef', target: 100_000, saved: 99_950, monthly: 0, isEmergencyFund: true })],
    });
    expect(line(buildSmartPlan(data, today), 'ef').to).toBe(100);
  });

  it('full safety net => 0 with a nice note', () => {
    const data = budget({ incomes: [pay(300_000)], goals: [fullEF({ monthly: 5_000 })] });
    const plan = buildSmartPlan(data, today);
    expect(line(plan, 'ef')).toMatchObject({ from: 5_000, to: 0, why: 'Your safety net is full. Nice work!' });
    expect(plan.changes.map((c) => c.id)).toContain('ef');
    checkInvariants(data, plan);
  });
});

describe('goals with a deadline', () => {
  const data = budget({
    incomes: [pay(400_000)],
    bills: [bill({ amount: 200_000 })],
    spending: [spending({ name: 'Fun', monthly: 20_000, kind: 'fun' })],
    goals: [
      fullEF(),
      goal({ id: 'wedding', name: 'Wedding', target: 600_000, targetDate: '2027-04-15', monthly: 50_000 }), // 6 months
      goal({ id: 'car', name: 'Car', target: 500_000, targetDate: '2027-02-01', monthly: 0 }), // 4 months
      goal({ id: 'trip', name: 'Trip', target: 120_000, targetDate: '2027-10-01', monthly: 10_000 }), // 12 months
    ],
  });
  const plan = buildSmartPlan(data, today);

  it('are funded nearest deadline first and capped by what is left', () => {
    // free $2,000 → fun min($400, $1,000) = $400 → buffer $100 → $1,500 for goals
    expect(line(plan, 'Fun').to).toBe(40_000);
    expect(plan.lines.map((l) => l.id)).toEqual(['ef', expect.any(String), 'car', 'wedding', 'trip']);
    expect(line(plan, 'car').to).toBe(125_000); // needs $1,250/month, fully funded
    expect(line(plan, 'car').why).toBe('This is what it takes to reach $5,000 by February 2027.');
    expect(line(plan, 'wedding').to).toBe(25_000); // needs $1,000 but only $250 is left
    expect(line(plan, 'wedding').why).toBe(
      "This is all that's left for it, so it won't reach $6,000 by April 2027. A later date would help.",
    );
    expect(line(plan, 'trip').to).toBe(0);
    expect(plan.leftOverAfter).toBe(10_000);
    checkInvariants(data, plan);
  });

  it('impact shows reach months before and after', () => {
    const car = plan.impact.goals.find((g) => g.id === 'car');
    expect(car).toEqual({ id: 'car', name: 'Car', emoji: '✈️', before: null, after: '2027-02' });
    const wedding = plan.impact.goals.find((g) => g.id === 'wedding');
    expect(wedding?.before).toBe('2027-10'); // $6,000 / $500
    expect(wedding?.after).toBe('2028-10'); // $6,000 / $250 = 24 months
  });

  it('needed per month is rounded up to whole dollars', () => {
    // $1,000 over 7 months = $142.857… => $143
    const d = budget({
      incomes: [pay(500_000)],
      goals: [fullEF(), goal({ id: 'g', target: 100_000, targetDate: '2027-05-01' })],
    });
    const p = buildSmartPlan(d, today);
    expect(line(p, 'g').to).toBe(14_300);
    expect(line(p, 'g').why).toBe(PLAN_WHY.deadlineFunded(100_000, '2027-05'));
    checkInvariants(d, p);
  });

  it('same deadline: alphabetical', () => {
    const d = budget({
      incomes: [pay(300_000)],
      bills: [bill({ amount: 200_000 })],
      goals: [
        fullEF(),
        goal({ id: 'z', name: 'Zoo', target: 1_000_000, targetDate: '2027-04-01' }),
        goal({ id: 'a', name: 'Art', target: 1_000_000, targetDate: '2027-04-01' }),
      ],
    });
    const p = buildSmartPlan(d, today);
    const ids = p.lines.filter((l) => l.kind === 'goal' && l.id !== 'ef').map((l) => l.id);
    expect(ids).toEqual(['a', 'z']);
    expect(line(p, 'a').to).toBeGreaterThan(0);
    expect(line(p, 'z').to).toBe(0);
  });

  it('reached goals are left out; past-due goals are treated as open goals', () => {
    const d = budget({
      incomes: [pay(300_000)],
      goals: [
        fullEF(),
        goal({ id: 'done', target: 50_000, saved: 50_000, monthly: 5_000 }),
        goal({ id: 'late', name: 'Late', target: 100_000, saved: 20_000, targetDate: '2026-09-01' }),
      ],
    });
    const p = buildSmartPlan(d, today);
    expect(p.lines.some((l) => l.id === 'done')).toBe(false);
    expect(line(p, 'late').why).toBe(PLAN_WHY.pastDue);
    expect(line(p, 'late').to).toBeGreaterThan(0);
    checkInvariants(d, p);
  });
});

describe('extra debt vs open goals', () => {
  // income $5,000, bills $2,000, minimum $100 => free $2,900; EF full; fun $500 (new); buffer $100 → $2,300 left
  // $4,000 keeps the 24.99% card's interest ($83.30) under its $100 minimum, so the growing-debt rule stays out of it.
  const make = (rateBps: number, withGoal = true, method: 'avalanche' | 'snowball' = 'avalanche', balance = 400_000) =>
    budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 200_000 })],
      debts: [debt({ id: 'd', name: 'Credit Card', balance, rateBps, minPayment: 10_000 })],
      goals: withGoal ? [fullEF(), goal({ id: 'house', name: 'House', target: 10_000_000 })] : [fullEF()],
      settings: { payoffMethod: method },
    });

  it('high interest (>= 8%): 75% to debt', () => {
    const plan = buildSmartPlan(make(2499), today);
    expect(line(plan, 'Fun Money').to).toBe(50_000);
    expect(line(plan, 'Extra debt payment')).toMatchObject({
      kind: 'extraDebt',
      id: null,
      from: 0,
      to: 172_500,
      why: 'Your Credit Card charges 24.99% interest, so every extra dollar there saves you the most money.',
    });
    expect(line(plan, 'house').to).toBe(57_500);
    expect(line(plan, 'house').why).toBe(PLAN_WHY.openGoal);
    expect(plan.leftOverAfter).toBe(10_000);
    checkInvariants(make(2499), plan);
  });

  it('exactly 8% is high interest', () => {
    expect(line(buildSmartPlan(make(800), today), 'Extra debt payment').to).toBe(172_500);
  });

  it('mid rate (5% to under 8%): 50/50', () => {
    for (const rate of [500, 680, 799]) {
      const plan = buildSmartPlan(make(rate), today);
      expect(line(plan, 'Extra debt payment').to).toBe(115_000);
      expect(line(plan, 'Extra debt payment').why).toBe(PLAN_WHY.debtMid);
      expect(line(plan, 'house').to).toBe(115_000);
    }
  });

  it('low rate only (< 5%): 25% to debt', () => {
    const plan = buildSmartPlan(make(300), today);
    expect(line(plan, 'Extra debt payment').to).toBe(57_500);
    expect(line(plan, 'Extra debt payment').why).toBe(
      'Your debts have low interest rates, so extra money is split between them and your goals.',
    );
    expect(line(plan, 'house').to).toBe(172_500);
    checkInvariants(make(300), plan);
  });

  it('no open goals: everything left goes to debt', () => {
    const plan = buildSmartPlan(make(300, false), today);
    expect(line(plan, 'Extra debt payment').to).toBe(230_000);
    expect(line(plan, 'Extra debt payment').why).toBe(PLAN_WHY.debtFocus('Credit Card', 300));
    checkInvariants(make(300, false), plan);
  });

  it('snowball wording names the smallest debt', () => {
    const data = make(2499, true, 'snowball');
    data.debts.push(debt({ id: 's', name: 'Store Card', balance: 30_000, rateBps: 1999, minPayment: 2_500 }));
    const plan = buildSmartPlan(data, today);
    expect(line(plan, 'Extra debt payment').why).toBe(
      'Paying off your smallest debt (Store Card) first gives you a quick win.',
    );
    checkInvariants(data, plan);
  });

  it('a mix of high and low debts counts as high interest', () => {
    const data = make(300);
    data.debts.push(debt({ name: 'Card', balance: 100_000, rateBps: 2200, minPayment: 2_500 }));
    const plan = buildSmartPlan(data, today);
    // free $2,875 - fun $500 - buffer $100 = $2,275 => 75% = $1,706
    expect(line(plan, 'Extra debt payment').to).toBe(170_600);
    expect(line(plan, 'Extra debt payment').why).toBe(PLAN_WHY.debtHighAvalanche('Card', 2200));
  });

  it('impact: a debt the minimum never pays off becomes finite with the plan', () => {
    // $5,000 at 24.99% => $104.12 interest per month > $100 minimum
    const plan = buildSmartPlan(make(2499, true, 'avalanche', 500_000), today);
    expect(plan.impact.monthsBefore).toBeNull();
    expect(plan.impact.debtFreeBefore).toBeNull();
    expect(plan.impact.monthsAfter).not.toBeNull();
  });

  it('a growing debt is handled first and explained', () => {
    const data = make(2499, true, 'avalanche', 500_000);
    const plan = buildSmartPlan(data, today);
    const extra = line(plan, 'Extra debt payment');
    expect(extra.why).toBe(PLAN_WHY.debtGrowing('Credit Card'));
    expect(plan.impact.monthsAfter ?? Infinity).toBeLessThanOrEqual(60);
    checkInvariants(data, plan);
  });

  it('a growing debt gets at least enough to stop growing, even when money is tight', () => {
    // free money $30: the 60-month target is out of reach, but the debt must still shrink
    const data = budget({
      incomes: [pay(213_000)],
      bills: [bill({ amount: 200_000 })],
      debts: [debt({ id: 'd', name: 'Credit Card', balance: 500_000, rateBps: 2499, minPayment: 10_000 })],
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.feasible).toBe(true);
    expect(plan.impact.monthsBefore).toBeNull();
    expect(plan.impact.monthsAfter).not.toBeNull();
    const extra = line(plan, 'Extra debt payment').to;
    // rescue = max(stop-growing amount, min(60-month target, half of free money)), then more debt money later
    expect(extra).toBeGreaterThanOrEqual(smallestExtraToFinish(data.debts, 'avalanche', '2026-10', 600, 3_000) ?? Infinity);
    expect(extra).toBeLessThanOrEqual(3_000);
    checkInvariants(data, plan);
  });

  it('a debt whose payment only covers the interest gets rescue money with its own reason', () => {
    // $5,000 at 24% => exactly $100 of interest; the $100 minimum keeps the balance flat.
    const data = budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 200_000 })],
      debts: [debt({ id: 'd', name: 'Credit Card', balance: 500_000, rateBps: 2400, minPayment: 10_000 })],
      goals: [fullEF()],
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.impact.monthsBefore).toBeNull();
    expect(plan.impact.monthsAfter).not.toBeNull();
    expect(line(plan, 'Extra debt payment').why).toBe(PLAN_WHY.debtFlat('Credit Card'));
    checkInvariants(data, plan);
  });

  it('a debt with no monthly payment (even at 0%) gets rescue money with its own reason', () => {
    const data = budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 200_000 })],
      debts: [debt({ id: 'd', name: 'Family Loan', type: 'personal', balance: 300_000, rateBps: 0, minPayment: 0 })],
      goals: [fullEF(), goal({ id: 'trip', name: 'Trip', target: 500_000 })],
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.impact.monthsBefore).toBeNull();
    expect(plan.impact.monthsAfter ?? Infinity).toBeLessThanOrEqual(PLAN_CONFIG.GROWING_DEBT_PAYOFF_MONTHS);
    expect(line(plan, 'Extra debt payment').to).toBeGreaterThan(0);
    expect(line(plan, 'Extra debt payment').why).toBe(PLAN_WHY.debtNoPayment('Family Loan'));
    checkInvariants(data, plan);
  });

  it('smallestExtraToFinish finds the exact smallest whole-dollar amount', () => {
    const d = [debt({ balance: 500_000, rateBps: 2499, minPayment: 10_000 })];
    const x = smallestExtraToFinish(d, 'avalanche', '2026-10', 60, 1_000_000) as number;
    expect(x % 100).toBe(0);
    expect(simulatePayoff(d, { method: 'avalanche', extra: x, startMonth: '2026-10', maxMonths: 60 }).months).not.toBeNull();
    expect(simulatePayoff(d, { method: 'avalanche', extra: x - 100, startMonth: '2026-10', maxMonths: 60 }).months).toBeNull();
    expect(smallestExtraToFinish(d, 'avalanche', '2026-10', 60, 100)).toBeNull();
    expect(smallestExtraToFinish([debt({ rateBps: 0 })], 'avalanche', '2026-10', 600, 0)).toBe(0);
  });

  it('impact: debt-free sooner and less interest with the plan', () => {
    const data = make(2499);
    data.debts[0] = { ...data.debts[0], balance: 300_000 };
    const plan = buildSmartPlan(data, today);
    expect(plan.impact.monthsBefore).not.toBeNull();
    expect(plan.impact.monthsAfter ?? Infinity).toBeLessThan(plan.impact.monthsBefore ?? 0);
    expect(plan.impact.interestAfter).toBeLessThan(plan.impact.interestBefore);
    expect(plan.impact.debtFreeAfter && plan.impact.debtFreeBefore && plan.impact.debtFreeAfter < plan.impact.debtFreeBefore).toBe(
      true,
    );
  });

  it('no money for extra: says minimums are covered', () => {
    // free money exactly 0 after fixed costs
    const data = budget({
      incomes: [pay(110_000)],
      bills: [bill({ amount: 100_000 })],
      debts: [debt({ minPayment: 10_000 })],
      goals: [fullEF()],
      settings: { extraDebtPayment: 5_000 },
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.feasible).toBe(true);
    expect(line(plan, 'Extra debt payment')).toMatchObject({ from: 5_000, to: 0, why: PLAN_WHY.debtNone });
    expect(plan.leftOverBefore).toBe(-5_000);
    expect(plan.leftOverAfter).toBe(0);
    checkInvariants(data, plan);
  });

  it('paid-off debts do not get an extra line', () => {
    const data = budget({
      incomes: [pay(300_000)],
      debts: [debt({ balance: 0 })],
      goals: [fullEF()],
      settings: { extraDebtPayment: 5_000 },
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.lines.some((l) => l.kind === 'extraDebt')).toBe(false);
    checkInvariants(data, plan);
  });
});

describe('open goals split', () => {
  it('equal split, capped at what is left to save, extra dollar to the earliest-listed', () => {
    // free $1,999 → fun $500 → buffer $100 → $1,399 for goals
    const data = budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 300_100 })],
      goals: [
        fullEF(),
        goal({ id: 'small', target: 3_000 }),
        goal({ id: 'b', target: 10_000_000 }),
        goal({ id: 'c', target: 10_000_000 }),
      ],
    });
    const plan = buildSmartPlan(data, today);
    expect(line(plan, 'small').to).toBe(3_000);
    expect(line(plan, 'small').why).toBe(PLAN_WHY.openGoalFinishes);
    expect(line(plan, 'b').to).toBe(68_500);
    expect(line(plan, 'c').to).toBe(68_400);
    checkInvariants(data, plan);
  });

  it('overflow goes to extra debt when every goal is capped', () => {
    const data = budget({
      incomes: [pay(500_000)],
      bills: [bill({ amount: 300_000 })],
      debts: [debt({ id: 'loan', name: 'Loan', balance: 1_000_000, rateBps: 300, minPayment: 10_000 })],
      goals: [fullEF(), goal({ id: 'small', target: 3_000 })],
    });
    // free $1,900 → fun $500 → buffer $100 → $1,300 → 25% = $325 extra → goal $30 (capped) → overflow $945 → extra
    const plan = buildSmartPlan(data, today);
    expect(line(plan, 'small').to).toBe(3_000);
    expect(line(plan, 'Extra debt payment').to).toBe(127_000);
    expect(plan.leftOverAfter).toBe(10_000);
    checkInvariants(data, plan);
  });

  it('overflow stays as left over without debt', () => {
    const data = budget({ incomes: [pay(500_000)], goals: [fullEF(), goal({ id: 'small', target: 3_000 })] });
    const plan = buildSmartPlan(data, today);
    expect(line(plan, 'small').to).toBe(3_000);
    // free $5,000 → fun $500 → buffer $100 → $4,400 → goal $30 → $4,370 stays (+ $100 buffer)
    expect(plan.leftOverAfter).toBe(447_000);
    checkInvariants(data, plan);
  });
});

describe('over budget but feasible', () => {
  it('gets fixed: left over becomes >= 0', () => {
    const data = budget({
      incomes: [pay(300_000)],
      bills: [bill({ amount: 150_000 })],
      spending: [spending({ monthly: 50_000, kind: 'need' }), spending({ id: 'fun', name: 'Fun', monthly: 80_000, kind: 'fun' })],
      goals: [goal({ id: 'g', name: 'Car', monthly: 60_000, target: 1_000_000 })],
    });
    expect(monthlySummary(data).leftOver).toBe(-40_000);
    const plan = buildSmartPlan(data, today);
    expect(plan.feasible).toBe(true);
    expect(plan.hasSuggestions).toBe(true);
    expect(plan.leftOverBefore).toBe(-40_000);
    expect(plan.newGoal?.monthly).toBe(40_000);
    expect(line(plan, 'fun').to).toBe(30_000);
    expect(line(plan, 'g').to).toBe(27_000);
    expect(plan.leftOverAfter).toBe(3_000);
    checkInvariants(data, plan);
  });

  it('zero free money is still feasible: everything adjustable goes to $0', () => {
    const data = budget({
      incomes: [pay(200_000)],
      bills: [bill({ amount: 200_000 })],
      spending: [spending({ id: 'fun', name: 'Fun', monthly: 10_000, kind: 'fun' })],
    });
    const plan = buildSmartPlan(data, today);
    expect(plan.feasible).toBe(true);
    expect(line(plan, 'fun')).toMatchObject({ to: 0, why: PLAN_WHY.funNone });
    // No money for a safety net => don't suggest creating an empty one.
    expect(plan.newGoal).toBeNull();
    expect(plan.leftOverAfter).toBe(0);
    checkInvariants(data, plan);
  });

  it('an empty budget has no suggestions', () => {
    const plan = buildSmartPlan(budget({}), today);
    expect(plan.feasible).toBe(true);
    expect(plan.newGoal).toBeNull();
    expect(plan.newSpending).toBeNull();
    expect(plan.changes).toHaveLength(0);
    expect(plan.hasSuggestions).toBe(false);
  });
});

describe('changes threshold', () => {
  it('lists every change, but only nudges about moves of at least $5 (plus new items)', () => {
    const base = budget({
      incomes: [pay(400_000)],
      bills: [bill({ amount: 100_000 })],
      spending: [spending({ id: 'fun', name: 'Fun', monthly: 40_000, kind: 'fun' })],
      goals: [fullEF()],
    });
    // planned fun = $400
    const p0 = buildSmartPlan(base, today);
    expect(line(p0, 'fun').to).toBe(40_000);
    expect(p0.changes.some((c) => c.id === 'fun')).toBe(false);
    const off4 = { ...base, spending: [{ ...base.spending[0], monthly: 39_600 }] };
    const off5 = { ...base, spending: [{ ...base.spending[0], monthly: 39_500 }] };
    // weights change but there is only one fun category, so it still gets all $400
    const p4 = buildSmartPlan(off4, today);
    expect(p4.changes.some((c) => c.id === 'fun')).toBe(true);
    expect(p4.hasSuggestions).toBe(false);
    const p5 = buildSmartPlan(off5, today);
    expect(p5.changes.some((c) => c.id === 'fun')).toBe(true);
    expect(p5.hasSuggestions).toBe(true);
  });
});

describe('idempotency and invariants', () => {
  it('apply → rebuild yields no changes for the hand-built scenarios', () => {
    const scenarios: BudgetData[] = [
      budget({ incomes: [pay(500_000)] }),
      budget({
        incomes: [income({ amount: 145_000, frequency: 'biweekly' }), income({ amount: 25_000, frequency: 'weekly' })],
        bills: [bill({ amount: 123_456 }), bill({ amount: 33_333, frequency: 'quarterly', dueDate: '2026-12-01' })],
        debts: [
          debt({ balance: 240_000, rateBps: 2499, minPayment: 7_500 }),
          debt({ name: 'Student', balance: 1_450_000, rateBps: 680, minPayment: 16_500 }),
        ],
        spending: [spending({ monthly: 35_017, kind: 'need' }), spending({ name: 'Fun', monthly: 12_345, kind: 'fun' })],
        goals: [
          goal({ name: 'EF', target: 200_000, saved: 65_000, monthly: 10_000, isEmergencyFund: true }),
          goal({ name: 'Trip', target: 150_000, saved: 40_000, targetDate: '2027-06-15' }),
          goal({ name: 'Laptop', target: 120_050, saved: 0 }),
          goal({ name: 'Late', target: 50_000, saved: 1_000, targetDate: '2026-05-01' }),
        ],
        settings: { extraDebtPayment: 3_333, payoffMethod: 'snowball' },
      }),
      budget({
        incomes: [pay(250_000)],
        bills: [bill({ amount: 180_000 })],
        debts: [debt({ balance: 50_000, rateBps: 0, minPayment: 5_000 })],
        spending: [spending({ name: 'A', monthly: 1, kind: 'fun' }), spending({ name: 'B', monthly: 2, kind: 'fun' })],
      }),
    ];
    for (const s of scenarios) {
      const plan = buildSmartPlan(s, today);
      expect(plan.feasible).toBe(true);
      checkInvariants(s, plan);
    }
  });

  it('property: random budgets keep every invariant (incl. idempotency)', () => {
    let seed = 20261008;
    const r = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    const pick = <T>(xs: readonly T[]): T => xs[r(xs.length)];
    const dates = [null, '2026-01-15', '2026-10-31', '2026-11-15', '2027-03-01', '2027-12-31', '2029-06-30'];
    let feasibleCount = 0;
    for (let i = 0; i < 400; i++) {
      const data = budget({
        incomes: Array.from({ length: r(3) }, () =>
          income({ amount: 20_000 + r(400_000), frequency: pick(['weekly', 'biweekly', 'semimonthly', 'monthly'] as const) }),
        ),
        bills: Array.from({ length: r(6) }, () =>
          bill({
            amount: 500 + r(150_000),
            frequency: pick(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const),
          }),
        ),
        debts: Array.from({ length: r(4) }, () =>
          debt({
            balance: r(4) === 0 ? 0 : r(3_000_000),
            rateBps: pick([0, 300, 499, 500, 680, 799, 800, 2499]),
            minPayment: r(40_000),
          }),
        ),
        spending: Array.from({ length: r(5) }, () => spending({ monthly: r(80_000), kind: pick(['need', 'fun'] as const) })),
        goals: Array.from({ length: r(5) }, (_, k) => {
          const target = r(5) === 0 ? 0 : r(2_000_000);
          return goal({
            target,
            saved: r(target + 50_000),
            monthly: r(60_000),
            targetDate: pick(dates),
            isEmergencyFund: k === 0 && r(2) === 0,
          });
        }),
        settings: { extraDebtPayment: r(30_000), payoffMethod: pick(['avalanche', 'snowball'] as const) },
      });
      const plan = buildSmartPlan(data, today);
      if (plan.feasible) feasibleCount++;
      checkInvariants(data, plan);
    }
    expect(feasibleCount).toBeGreaterThan(100);
  });

  it('applySmartPlan never mutates its input', () => {
    const data = budget({
      incomes: [pay(500_000)],
      debts: [debt()],
      spending: [spending({ kind: 'fun', monthly: 1_000 })],
      goals: [goal({ isEmergencyFund: true, target: 500_000 })],
    });
    const snapshot = structuredClone(data);
    const plan = buildSmartPlan(data, today);
    const applied = applySmartPlan(data, plan);
    expect(data).toEqual(snapshot);
    expect(applied.spending).not.toBe(data.spending);
    expect(applied.goals).not.toBe(data.goals);
    expect(applied.settings).not.toBe(data.settings);
    expect(applied.settings.extraDebtPayment).toBe(line(plan, 'Extra debt payment').to);
  });
});

describe('split helpers', () => {
  it('splitByWeight', () => {
    expect(splitByWeight(203, [10_000, 5_000])).toEqual([135, 68]);
    expect(splitByWeight(100, [0, 0, 0])).toEqual([34, 33, 33]);
    expect(splitByWeight(0, [1, 2])).toEqual([0, 0]);
    expect(splitByWeight(10, [])).toEqual([]);
    expect(splitByWeight(7, [5])).toEqual([7]);
    expect(splitByWeight(10_000_000, [999_999_999, 1, 999_999_999])).toEqual([5_000_000, 0, 5_000_000]);
    const big = splitByWeight(9_999_999, [123_456_789, 987_654_321, 555]);
    expect(big.reduce((s, x) => s + x, 0)).toBe(9_999_999);
  });

  it('splitEquallyWithCaps', () => {
    expect(splitEquallyWithCaps(1_400, [30, 100_000, 100_000])).toEqual({ gives: [30, 685, 685], overflow: 0 });
    expect(splitEquallyWithCaps(1_399, [30, 100_000, 100_000])).toEqual({ gives: [30, 685, 684], overflow: 0 });
    expect(splitEquallyWithCaps(100, [10, 20])).toEqual({ gives: [10, 20], overflow: 70 });
    expect(splitEquallyWithCaps(5, [3, 10])).toEqual({ gives: [3, 2], overflow: 0 });
    expect(splitEquallyWithCaps(5, [2, 10])).toEqual({ gives: [2, 3], overflow: 0 });
    expect(splitEquallyWithCaps(0, [2, 10])).toEqual({ gives: [0, 0], overflow: 0 });
    expect(splitEquallyWithCaps(10, [])).toEqual({ gives: [], overflow: 10 });
    expect(splitEquallyWithCaps(9, [0, 100, 100])).toEqual({ gives: [0, 5, 4], overflow: 0 });
  });
});

describe("buildSmartPlan: huge amounts stay inside the app's money limit", () => {
  // A $9,999,999.99 weekly paycheck is about $43 million a month: more than any one amount can hold.
  const huge = (paychecks: number) =>
    budget({
      incomes: Array.from({ length: paychecks }, () =>
        income({ amount: MAX_MONEY_CENTS, frequency: 'weekly', payDate: '2026-10-09' }),
      ),
      bills: [bill({ amount: MAX_MONEY_CENTS }), bill({ name: 'Mortgage', amount: MAX_MONEY_CENTS })],
      debts: [debt({ id: 'd', name: 'Credit Card', balance: MAX_MONEY_CENTS, rateBps: 2499, minPayment: 1_000 })],
      spending: [spending({ id: 'fun', name: 'Fun', monthly: 10_000, kind: 'fun' })],
      goals: [goal({ id: 'yacht', name: 'Yacht', target: MAX_MONEY_CENTS })],
    });

  const expectStorable = (plan: SmartPlan) => {
    for (const l of plan.lines) {
      expect(l.to).toBeLessThanOrEqual(MAX_MONEY_CENTS);
      expect(l.to % 100).toBe(0);
    }
    expect(plan.newGoal?.target ?? 0).toBeLessThanOrEqual(MAX_MONEY_CENTS);
    expect(plan.newGoal?.monthly ?? 0).toBeLessThanOrEqual(MAX_MONEY_CENTS);
  };

  it('one $9,999,999.99 weekly paycheck and a huge debt: every amount fits', () => {
    const data = huge(1);
    const plan = buildSmartPlan(data, today);
    expect(plan.feasible).toBe(true);
    expectStorable(plan);
    checkInvariants(data, plan);
  });

  it('when even more is free, each line stops at the limit and the rest stays as Left Over', () => {
    const data = huge(3);
    const plan = buildSmartPlan(data, today);
    expect(MAX_PLAN_AMOUNT).toBe(999_999_900);
    expectStorable(plan);
    expect(plan.newGoal).toMatchObject({ target: MAX_PLAN_AMOUNT, monthly: MAX_PLAN_AMOUNT });
    expect(line(plan, 'fun').to).toBe(MAX_PLAN_AMOUNT);
    expect(line(plan, 'yacht').to).toBe(MAX_PLAN_AMOUNT);
    expect(line(plan, 'Extra debt payment').to).toBe(MAX_PLAN_AMOUNT);
    const S = monthlySummary(data);
    const allocated = plan.lines.reduce((a, l) => a + l.to, 0);
    expect(plan.leftOverAfter).toBe(S.income - S.bills - S.debtMinimums - S.spendingNeeds - allocated);
    expect(plan.leftOverAfter).toBeGreaterThan(MAX_MONEY_CENTS);
    checkInvariants(data, plan);

    const applied = applySmartPlan(data, plan);
    expect(applied.settings.extraDebtPayment).toBeLessThanOrEqual(MAX_MONEY_CENTS);
    for (const g of applied.goals) {
      expect(g.monthly).toBeLessThanOrEqual(MAX_MONEY_CENTS);
      expect(g.target).toBeLessThanOrEqual(MAX_MONEY_CENTS);
    }
    for (const c of applied.spending) expect(c.monthly).toBeLessThanOrEqual(MAX_MONEY_CENTS);
  });
});
