import { describe, expect, it } from 'vitest';
import { projectGoal } from './goals';
import { goal } from './testUtils';

const today = '2026-10-08';

describe('projectGoal', () => {
  it('reached (saved >= target)', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 150_000, monthly: 10_000 }), today);
    expect(p).toEqual({
      remaining: 0,
      percent: 100,
      monthsToGoal: 0,
      reachMonth: '2026-10',
      monthsLeft: null,
      neededPerMonth: null,
      status: 'reached',
    });
    const over = projectGoal(goal({ target: 150_000, saved: 200_000 }), today);
    expect(over.status).toBe('reached');
    expect(over.percent).toBe(100);
    expect(over.remaining).toBe(0);
  });

  it('reached wins over a passed deadline', () => {
    const p = projectGoal(goal({ target: 100_000, saved: 100_000, targetDate: '2026-01-15' }), today);
    expect(p.status).toBe('reached');
    expect(p.monthsLeft).toBe(-9);
    expect(p.neededPerMonth).toBeNull();
  });

  it('target 0 counts as reached', () => {
    const p = projectGoal(goal({ target: 0, saved: 0, monthly: 0 }), today);
    expect(p.status).toBe('reached');
    expect(p.percent).toBe(100);
    expect(p.monthsToGoal).toBe(0);
  });

  it('on-track: monthly >= needed per month', () => {
    // $1,100 left, deadline May 2027 => 7 months => ceil(110,000 / 7) = 15,715
    const p = projectGoal(goal({ target: 150_000, saved: 40_000, monthly: 16_000, targetDate: '2027-05-15' }), today);
    expect(p.monthsLeft).toBe(7);
    expect(p.neededPerMonth).toBe(15_715);
    expect(p.status).toBe('on-track');
    expect(p.monthsToGoal).toBe(7); // ceil(110,000 / 16,000) = 6.875 => 7
    expect(p.reachMonth).toBe('2027-05');
    expect(p.percent).toBe(26); // 40,000 / 150,000 = 26.67%
    expect(projectGoal(goal({ target: 150_000, saved: 40_000, monthly: 15_715, targetDate: '2027-05-01' }), today).status).toBe(
      'on-track',
    );
  });

  it('behind: monthly < needed (incl. zero contribution)', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 40_000, monthly: 15_000, targetDate: '2027-05-15' }), today);
    expect(p.status).toBe('behind');
    expect(p.neededPerMonth).toBe(15_715);
    expect(p.reachMonth).toBe('2027-06'); // ceil(110,000 / 15,000) = 8
    const zero = projectGoal(goal({ target: 150_000, saved: 40_000, monthly: 0, targetDate: '2027-05-15' }), today);
    expect(zero.status).toBe('behind');
    expect(zero.monthsToGoal).toBeNull();
    expect(zero.reachMonth).toBeNull();
  });

  it('deadline next month needs everything next month', () => {
    const p = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 0, targetDate: '2026-11-30' }), today);
    expect(p.monthsLeft).toBe(1);
    expect(p.neededPerMonth).toBe(40_000);
    expect(p.status).toBe('behind');
  });

  it('deadline later this month: still open, needs the rest now', () => {
    const thisMonth = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 5_000, targetDate: '2026-10-31' }), today);
    expect(thisMonth.status).toBe('behind');
    expect(thisMonth.monthsLeft).toBe(0);
    expect(thisMonth.neededPerMonth).toBe(40_000);
    expect(thisMonth.monthsToGoal).toBe(8);
    const covered = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 40_000, targetDate: '2026-10-08' }), today);
    expect(covered.status).toBe('on-track'); // due today counts as not yet passed
  });

  it('past-due: deadline date before today and not reached', () => {
    const yesterday = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 5_000, targetDate: '2026-10-07' }), today);
    expect(yesterday.status).toBe('past-due');
    expect(yesterday.neededPerMonth).toBe(40_000);
    const earlier = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 0, targetDate: '2025-12-25' }), today);
    expect(earlier.status).toBe('past-due');
    expect(earlier.monthsLeft).toBe(-10);
    expect(earlier.neededPerMonth).toBe(40_000);
    expect(earlier.reachMonth).toBeNull();
  });

  it('no-deadline: months to goal = ceil(remaining / monthly), first contribution next month', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 0, monthly: 15_000 }), today);
    expect(p.status).toBe('no-deadline');
    expect(p.monthsToGoal).toBe(10);
    expect(p.reachMonth).toBe('2027-08');
    expect(p.monthsLeft).toBeNull();
    expect(p.neededPerMonth).toBeNull();
    const oneMore = projectGoal(goal({ target: 150_001, saved: 0, monthly: 15_000 }), today);
    expect(oneMore.monthsToGoal).toBe(11);
    const nextMonth = projectGoal(goal({ target: 150_000, saved: 149_000, monthly: 15_000 }), today);
    expect(nextMonth.monthsToGoal).toBe(1);
    expect(nextMonth.reachMonth).toBe('2026-11');
  });

  it('no-contribution: no deadline and monthly 0', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 20_000, monthly: 0 }), today);
    expect(p).toEqual({
      remaining: 130_000,
      percent: 13,
      monthsToGoal: null,
      reachMonth: null,
      monthsLeft: null,
      neededPerMonth: null,
      status: 'no-contribution',
    });
  });

  it('percent is floored and clamped', () => {
    expect(projectGoal(goal({ target: 300, saved: 299 }), today).percent).toBe(99);
    expect(projectGoal(goal({ target: 300, saved: 0 }), today).percent).toBe(0);
    expect(projectGoal(goal({ target: 300, saved: 1 }), today).percent).toBe(0);
  });

  it('works across a year boundary', () => {
    const p = projectGoal(goal({ target: 120_000, saved: 0, monthly: 10_000, targetDate: '2027-12-01' }), '2026-12-31');
    expect(p.monthsLeft).toBe(12);
    expect(p.neededPerMonth).toBe(10_000);
    expect(p.status).toBe('on-track');
    expect(p.reachMonth).toBe('2027-12');
  });
});
