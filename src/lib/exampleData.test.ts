import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../types';
import { addDays, dayOfWeek, isValidISODate, monthKey } from './dates';
import { interestWarnings, simulatePayoff } from './debt';
import { makeExampleBudget } from './exampleData';
import { projectGoal } from './goals';
import { paycheckPlan } from './schedule';
import { applySmartPlan, buildSmartPlan } from './smartPlan';
import { billsForMonth, homeBreakdown, monthlySummary } from './summary';

const todays = ['2026-10-08', '2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31', '2027-03-31', '2026-11-01'];

describe('makeExampleBudget', () => {
  it.each(todays)('is a valid, flagged example budget (%s)', (today) => {
    const d = makeExampleBudget(today);
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d.settings.isExample).toBe(true);
    expect(d.settings.onboarded).toBe(true);
    const ids = [...d.incomes, ...d.bills, ...d.debts, ...d.spending, ...d.goals].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of d.incomes) expect(isValidISODate(i.payDate)).toBe(true);
    for (const b of d.bills) {
      expect(isValidISODate(b.dueDate)).toBe(true);
      expect(b.dueDay).toBeGreaterThanOrEqual(1);
      expect(b.dueDay).toBeLessThanOrEqual(31);
      expect(b.paidMonth === null || b.paidMonth === monthKey(today)).toBe(true);
    }
    for (const g of d.goals) if (g.targetDate) expect(isValidISODate(g.targetDate)).toBe(true);
    expect(d.goals.filter((g) => g.isEmergencyFund)).toHaveLength(1);
    const money = [
      ...d.incomes.map((x) => x.amount),
      ...d.bills.map((x) => x.amount),
      ...d.debts.flatMap((x) => [x.balance, x.minPayment]),
      ...d.spending.map((x) => x.monthly),
      ...d.goals.flatMap((x) => [x.target, x.saved, x.monthly]),
    ];
    expect(money.every((c) => Number.isInteger(c) && c >= 0)).toBe(true);
  });

  it.each(todays)('has a modest positive left over (%s)', (today) => {
    const s = monthlySummary(makeExampleBudget(today));
    expect(s.leftOver).toBeGreaterThan(0);
    expect(s.leftOver).toBeLessThan(s.income * 0.15);
    expect(homeBreakdown(s).over).toBe(false);
  });

  it.each(todays)('shows off the Smart Plan, which is idempotent (%s)', (today) => {
    const d = makeExampleBudget(today);
    const plan = buildSmartPlan(d, today);
    expect(plan.feasible).toBe(true);
    expect(plan.hasSuggestions).toBe(true);
    expect(plan.changes.length).toBeGreaterThanOrEqual(3);
    expect(plan.leftOverAfter).toBeGreaterThanOrEqual(0);
    const again = buildSmartPlan(applySmartPlan(d, plan), today);
    expect(again.changes).toEqual([]);
  });

  it.each(todays)('paycheck plan has 4 windows and items to show (%s)', (today) => {
    const d = makeExampleBudget(today);
    const windows = paycheckPlan(d, today);
    expect(windows).toHaveLength(4);
    expect(windows.some((w) => w.items.length > 0)).toBe(true);
    // The first payday is a Friday within a week, with both incomes merged.
    expect(dayOfWeek(windows[0].payday.date)).toBe(5);
    expect(windows[0].payday.date <= addDays(today, 6)).toBe(true);
    expect(windows[0].payday.sources).toHaveLength(2);
  });

  it('debts pay off, no never-payoff warnings, and goals are in interesting states', () => {
    const today = '2026-10-08';
    const d = makeExampleBudget(today);
    expect(interestWarnings(d.debts)).toEqual([]);
    const sim = simulatePayoff(d.debts, {
      method: d.settings.payoffMethod,
      extra: d.settings.extraDebtPayment,
      startMonth: monthKey(today),
    });
    expect(sim.months).not.toBeNull();
    const rates = d.debts.map((x) => x.rateBps).sort((a, b) => a - b);
    expect(rates).toEqual([590, 680, 2499]);
    const trip = d.goals.find((g) => g.name === 'Florida Trip');
    expect(trip?.targetDate).not.toBeNull();
    expect(projectGoal(trip ?? d.goals[0], today).status).toBe('behind');
    const ef = d.goals.find((g) => g.isEmergencyFund);
    expect(projectGoal(ef ?? d.goals[0], today).status).toBe('no-deadline');
  });

  it('bills show some paid, some unpaid and one not due this month', () => {
    const today = '2026-10-08';
    const m = billsForMonth(makeExampleBudget(today), monthKey(today));
    expect(m.paidCount).toBeGreaterThan(0);
    expect(m.paidCount).toBeLessThan(m.dueCount);
    expect(m.items.some((i) => !i.dueThisMonth)).toBe(true);
  });
});
