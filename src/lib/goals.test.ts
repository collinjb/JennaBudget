import { describe, expect, it } from 'vitest';
import { projectGoal } from './goals';
import { goal } from './testUtils';

const today = '2026-10-08';

describe('projectGoal: reached', () => {
  it('reached (saved >= target): sets nothing aside', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 150_000, monthly: 10_000 }), today);
    expect(p).toMatchObject({ remaining: 0, percent: 100, auto: false, thisMonth: 0, thisMonthToGo: 0, status: 'reached' });
    expect(p.monthsToGoal).toBe(0);
    expect(p.reachMonth).toBe('2026-10');
    expect(projectGoal(goal({ target: 150_000, saved: 200_000 }), today).status).toBe('reached');
  });

  it('reached wins over a passed date, and target 0 counts as reached', () => {
    expect(projectGoal(goal({ target: 100_000, saved: 100_000, targetDate: '2026-01-15' }), today).status).toBe('reached');
    const zero = projectGoal(goal({ target: 0, saved: 0, monthly: 0 }), today);
    expect(zero.status).toBe('reached');
    expect(zero.percent).toBe(100);
  });
});

describe('projectGoal: goals with a target date set their own amount', () => {
  it('splits what is left over the months left, counting this month, in whole dollars', () => {
    // $1,100 left; Oct..May = 8 months including October → $137.50 → $138
    const p = projectGoal(goal({ target: 150_000, saved: 40_000, monthly: 999, targetDate: '2027-05-15' }), today);
    expect(p.auto).toBe(true);
    expect(p.status).toBe('on-track');
    expect(p.monthsLeft).toBe(7);
    expect(p.thisMonth).toBe(13_800);
    expect(p.savedThisMonth).toBe(0);
    expect(p.thisMonthToGo).toBe(13_800);
    expect(p.reachMonth).toBe('2027-05');
    expect(p.percent).toBe(26);
  });

  it("ignores the goal's own monthly amount", () => {
    const a = projectGoal(goal({ target: 120_000, targetDate: '2027-09-30', monthly: 0 }), today);
    const b = projectGoal(goal({ target: 120_000, targetDate: '2027-09-30', monthly: 99_999 }), today);
    expect(a.thisMonth).toBe(b.thisMonth);
    expect(a.thisMonth).toBe(10_000); // $1,200 over 12 months
  });

  it('stays put while money goes in this month', () => {
    const base = { target: 120_000, saved: 0, targetDate: '2027-09-30' };
    const before = projectGoal(goal(base), today);
    const after = projectGoal(goal({ ...base, saved: 4_000, monthDeposit: { month: '2026-10', amount: 4_000 } }), today);
    expect(after.thisMonth).toBe(before.thisMonth);
    expect(after.savedThisMonth).toBe(4_000);
    expect(after.thisMonthToGo).toBe(6_000);
    const done = projectGoal(goal({ ...base, saved: 10_000, monthDeposit: { month: '2026-10', amount: 10_000 } }), today);
    expect(done.thisMonthToGo).toBe(0);
  });

  it('a short month raises the next months so the goal is still reached on time', () => {
    // Planned $100/month for 12 months. In October only $40 went in.
    const nov = '2026-11-08';
    const short = goal({
      target: 120_000,
      saved: 4_000,
      targetDate: '2027-09-30',
      monthDeposit: { month: '2026-10', amount: 4_000 },
    });
    const p = projectGoal(short, nov);
    // $1,160 left over Nov..Sep = 11 months → $105.45 → $106
    expect(p.savedThisMonth).toBe(0); // last month's deposit doesn't count for November
    expect(p.thisMonth).toBe(10_600);
    // Putting in extra lowers later months instead.
    const extra = goal({ ...short, saved: 30_000, monthDeposit: { month: '2026-10', amount: 30_000 } });
    expect(projectGoal(extra, nov).thisMonth).toBe(8_200); // $900 / 11 → $81.82 → $82
  });

  it('following the plan every month reaches the goal exactly by the date', () => {
    let g = goal({ target: 123_456, saved: 1_234, targetDate: '2027-06-20' });
    const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'];
    for (const m of months) {
      const p = projectGoal(g, `${m}-10`);
      expect(p.auto).toBe(true);
      g = { ...g, saved: g.saved + p.thisMonth, monthDeposit: { month: m, amount: p.thisMonth } };
    }
    expect(g.saved).toBe(123_456);
    expect(projectGoal(g, '2027-06-21').status).toBe('reached');
  });

  it('missing a whole month still gets there by the date', () => {
    let g = goal({ target: 60_000, saved: 0, targetDate: '2027-03-31' });
    const months = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
    for (const m of months) {
      const p = projectGoal(g, `${m}-05`);
      const put = m === '2026-12' ? 0 : p.thisMonth; // December: unexpected expenses, nothing saved
      g = { ...g, saved: g.saved + put, monthDeposit: { month: m, amount: put } };
    }
    expect(g.saved).toBeGreaterThanOrEqual(60_000);
  });

  it('a date later this month (or today) needs everything that is left, this month', () => {
    const p = projectGoal(goal({ target: 50_000, saved: 10_000, targetDate: '2026-10-31' }), today);
    expect(p.auto).toBe(true);
    expect(p.monthsLeft).toBe(0);
    expect(p.thisMonth).toBe(40_000);
    expect(projectGoal(goal({ target: 50_000, saved: 10_000, targetDate: today }), today).thisMonth).toBe(40_000);
  });

  it('never asks for more than is left (rounding up to whole dollars is capped)', () => {
    const p = projectGoal(goal({ target: 10_050, saved: 0, targetDate: '2026-10-20' }), today);
    expect(p.thisMonth).toBe(10_050);
  });

  it('money taken out this month (negative deposit) is counted', () => {
    const p = projectGoal(
      goal({ target: 100_000, saved: 20_000, targetDate: '2027-01-31', monthDeposit: { month: '2026-10', amount: -5_000 } }),
      today,
    );
    // Started the month at $250 saved → $750 left over 4 months → $187.50 → $188
    expect(p.thisMonth).toBe(18_800);
    expect(p.savedThisMonth).toBe(-5_000);
    expect(p.thisMonthToGo).toBe(23_800);
  });

  it('works across a year boundary', () => {
    const p = projectGoal(goal({ target: 30_000, saved: 0, targetDate: '2027-01-15' }), '2026-12-20');
    expect(p.monthsLeft).toBe(1);
    expect(p.thisMonth).toBe(15_000);
  });
});

describe('projectGoal: past the date', () => {
  it('past-due uses its own monthly amount until a new date is picked', () => {
    const p = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 5_000, targetDate: '2026-10-07' }), today);
    expect(p.status).toBe('past-due');
    expect(p.auto).toBe(false);
    expect(p.thisMonth).toBe(5_000);
    expect(p.monthsToGoal).toBe(8);
    const none = projectGoal(goal({ target: 50_000, saved: 10_000, monthly: 0, targetDate: '2025-12-25' }), today);
    expect(none.thisMonth).toBe(0);
    expect(none.reachMonth).toBeNull();
  });
});

describe('projectGoal: goals without a date', () => {
  it('uses the chosen monthly amount; months to goal = ceil(remaining / monthly), first contribution next month', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 0, monthly: 15_000 }), today);
    expect(p).toMatchObject({ status: 'no-deadline', auto: false, thisMonth: 15_000, monthsToGoal: 10, reachMonth: '2027-08' });
    expect(projectGoal(goal({ target: 150_001, saved: 0, monthly: 15_000 }), today).monthsToGoal).toBe(11);
  });

  it('shows this month\'s progress from "Add money"', () => {
    const p = projectGoal(
      goal({ target: 150_000, saved: 4_000, monthly: 10_000, monthDeposit: { month: '2026-10', amount: 4_000 } }),
      today,
    );
    expect(p.savedThisMonth).toBe(4_000);
    expect(p.thisMonthToGo).toBe(6_000);
    // A deposit from another month doesn't count.
    const old = projectGoal(
      goal({ target: 150_000, saved: 4_000, monthly: 10_000, monthDeposit: { month: '2026-09', amount: 4_000 } }),
      today,
    );
    expect(old.savedThisMonth).toBe(0);
  });

  it('no-contribution when monthly is 0', () => {
    const p = projectGoal(goal({ target: 150_000, saved: 0, monthly: 0 }), today);
    expect(p).toMatchObject({ status: 'no-contribution', thisMonth: 0, monthsToGoal: null, reachMonth: null });
  });

  it('percent floors and clamps', () => {
    expect(projectGoal(goal({ target: 300, saved: 199 }), today).percent).toBe(66);
    expect(projectGoal(goal({ target: 100, saved: 0 }), today).percent).toBe(0);
  });
});

describe('projectGoal: this month never shows more than the goal holds', () => {
  it('caps the month’s deposit at the saved amount (saved was lowered by hand)', () => {
    const p = projectGoal(goal({ target: 100_000, saved: 3_000, monthly: 10_000, monthDeposit: { month: '2026-10', amount: 8_000 } }), today);
    expect(p.savedThisMonth).toBe(3_000);
  });
});
