import { describe, expect, it } from 'vitest';
import type { SpendEntry } from '../types';
import {
  categorySpend,
  monthlyFromWeekly,
  periodBudget,
  periodRange,
  pruneSpendLog,
  weekStart,
  weeklyFromMonthly,
} from './spending';
import { spending } from './testUtils';

const today = '2026-10-08'; // a Thursday
const entry = (over: Partial<SpendEntry> = {}): SpendEntry => ({
  id: Math.random().toString(36).slice(2),
  categoryId: 'fun',
  amount: 1_200,
  date: today,
  note: '',
  ...over,
});

describe('weeks and months', () => {
  it('weeks start on Sunday', () => {
    expect(weekStart('2026-10-08')).toBe('2026-10-04');
    expect(weekStart('2026-10-04')).toBe('2026-10-04');
    expect(weekStart('2026-10-10')).toBe('2026-10-04');
    expect(weekStart('2026-11-01')).toBe('2026-11-01'); // Sunday, DST change day
    expect(weekStart('2027-01-01')).toBe('2026-12-27'); // across a year
  });

  it('period ranges and days left (including today)', () => {
    expect(periodRange('week', today)).toEqual({ start: '2026-10-04', end: '2026-10-11', daysLeft: 3 });
    expect(periodRange('month', today)).toEqual({ start: '2026-10-01', end: '2026-11-01', daysLeft: 24 });
  });

  it('weekly ↔ monthly round-trips to the cent', () => {
    expect(monthlyFromWeekly(5_000)).toBe(21_667);
    expect(weeklyFromMonthly(21_667)).toBe(5_000);
    for (let w = 0; w <= 200_000; w += 37) expect(weeklyFromMonthly(monthlyFromWeekly(w))).toBe(w);
  });

  it('period budget', () => {
    expect(periodBudget(spending({ monthly: 21_667, period: 'week' }))).toBe(5_000);
    expect(periodBudget(spending({ monthly: 40_000, period: 'month' }))).toBe(40_000);
  });
});

describe('categorySpend', () => {
  const fun = spending({ id: 'fun', name: 'Fun Money', monthly: 21_667, kind: 'fun', period: 'week' });

  it('only counts this week’s purchases for this category', () => {
    const log = [
      entry({ amount: 1_200, date: '2026-10-05' }),
      entry({ amount: 800, date: '2026-10-08' }),
      entry({ amount: 5_000, date: '2026-10-03' }), // last week
      entry({ amount: 999, categoryId: 'groceries' }), // another category
      entry({ amount: 300, date: '2026-10-11' }), // next week
    ];
    const s = categorySpend(fun, log, today);
    expect(s.budget).toBe(5_000);
    expect(s.spent).toBe(2_000);
    expect(s.left).toBe(3_000);
    expect(s.over).toBe(false);
    expect(s.entries.map((e) => e.amount)).toEqual([800, 1_200]); // newest first
  });

  it('a monthly category counts the whole month', () => {
    const groceries = spending({ id: 'g', monthly: 40_000, period: 'month' });
    const log = [entry({ categoryId: 'g', amount: 15_000, date: '2026-10-01' }), entry({ categoryId: 'g', amount: 30_000, date: '2026-10-08' })];
    const s = categorySpend(groceries, log, today);
    expect(s.spent).toBe(45_000);
    expect(s.left).toBe(-5_000);
    expect(s.over).toBe(true);
  });

  it('a new week starts fresh', () => {
    const log = [entry({ amount: 4_000, date: '2026-10-08' })];
    expect(categorySpend(fun, log, '2026-10-11').spent).toBe(0);
  });
});

describe('pruneSpendLog', () => {
  it('drops purchases older than about 13 months and keeps the same array when nothing changes', () => {
    const log = [entry({ date: '2025-09-01' }), entry({ date: '2026-10-01' })];
    expect(pruneSpendLog(log, today).map((e) => e.date)).toEqual(['2026-10-01']);
    const fresh = [entry()];
    expect(pruneSpendLog(fresh, today)).toBe(fresh);
  });
});
