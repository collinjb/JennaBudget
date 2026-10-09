import type { Cents, Goal, ISODate, MonthKey } from '../types';
import { addMonthsToKey, compareISO, monthKey, monthsBetween } from './dates';
import { ceilDiv, ceilDollars } from './money';

export type GoalStatus =
  | 'reached' //         saved >= target
  | 'on-track' //        has a target date (today or later): the monthly amount is set automatically to get there
  | 'past-due' //        the target date has gone by and it isn't reached
  | 'no-deadline' //     no target date, monthly > 0
  | 'no-contribution'; // no target date, monthly = 0

export interface GoalProjection {
  remaining: Cents;
  /** floor(saved / target × 100), clamped 0..100. 100 when target is 0. */
  percent: number;
  /** True for a goal with a target date (today or later) that isn't reached: its monthly amount is automatic. */
  auto: boolean;
  /**
   * What the budget sets aside for this goal THIS month (it comes out of Left Over).
   * - auto: what's still needed at the start of this month ÷ the months left including this one, rounded up to
   *   whole dollars (never more than what's needed). Putting in less one month raises later months, so the goal is
   *   still reached on time; putting in more lowers them.
   * - no target date, or the date has gone by: the goal's own monthly amount.
   * - reached: 0.
   */
  thisMonth: Cents;
  /** Put in (or taken out) this month with "Add money". */
  savedThisMonth: Cents;
  /** max(0, thisMonth − savedThisMonth). */
  thisMonthToGo: Cents;
  /** targetMonth − currentMonth when a target date is set (0 = due this month), else null. */
  monthsLeft: number | null;
  /**
   * When the goal is reached: the target month for auto goals; for goals without a date,
   * currentMonth + ceil(remaining / monthly) (the first contribution counts next month); 0 months when reached.
   */
  monthsToGoal: number | null;
  reachMonth: MonthKey | null;
  status: GoalStatus;
}

export function projectGoal(goal: Goal, today: ISODate): GoalProjection {
  const currentMonth = monthKey(today);
  const target = Math.max(0, goal.target);
  const saved = Math.max(0, goal.saved);
  const monthly = Math.max(0, goal.monthly);
  const remaining = Math.max(0, target - saved);
  const reached = saved >= target;
  const percent = target <= 0 ? 100 : Math.min(100, Math.max(0, Math.floor((saved * 100) / target)));
  const monthsLeft = goal.targetDate ? monthsBetween(currentMonth, monthKey(goal.targetDate)) : null;
  const pastDue = goal.targetDate !== null && compareISO(goal.targetDate, today) < 0;
  // Never more than the goal holds (e.g. "saved so far" was lowered by hand after adding money this month).
  const savedThisMonth = Math.min(
    goal.monthDeposit && goal.monthDeposit.month === currentMonth ? goal.monthDeposit.amount : 0,
    saved,
  );
  const auto = !reached && goal.targetDate !== null && !pastDue;

  let thisMonth: Cents;
  let monthsToGoal: number | null = null;
  let status: GoalStatus;
  if (reached) {
    thisMonth = 0;
    monthsToGoal = 0;
    status = 'reached';
  } else if (auto) {
    // Recalculated from where the goal stood when this month began, so it stays put while money goes in this month.
    const startRemaining = Math.max(0, target - Math.max(0, saved - savedThisMonth));
    const monthsIncludingThis = Math.max(1, (monthsLeft ?? 0) + 1);
    thisMonth = Math.min(ceilDollars(ceilDiv(startRemaining, monthsIncludingThis)), startRemaining);
    monthsToGoal = Math.max(0, monthsLeft ?? 0);
    status = 'on-track';
  } else {
    thisMonth = monthly;
    if (monthly > 0) monthsToGoal = ceilDiv(remaining, monthly);
    status = pastDue ? 'past-due' : monthly > 0 ? 'no-deadline' : 'no-contribution';
  }
  const reachMonth = monthsToGoal === null ? null : addMonthsToKey(currentMonth, monthsToGoal);

  return {
    remaining,
    percent,
    auto,
    thisMonth,
    savedThisMonth,
    thisMonthToGo: Math.max(0, thisMonth - savedThisMonth),
    monthsLeft,
    monthsToGoal,
    reachMonth,
    status,
  };
}
