import type { Cents, Goal, ISODate, MonthKey } from '../types';
import { addMonthsToKey, compareISO, monthKey, monthsBetween } from './dates';
import { ceilDiv } from './money';

export type GoalStatus =
  | 'reached' //         saved >= target
  | 'on-track' //        has deadline, monthly >= neededPerMonth
  | 'behind' //          has deadline, monthly < neededPerMonth (incl. monthly = 0)
  | 'past-due' //        deadline date is before today, not reached
  | 'no-deadline' //     no deadline, monthly > 0
  | 'no-contribution'; // no deadline, monthly = 0

export interface GoalProjection {
  remaining: Cents;
  /** floor(saved / target × 100), clamped 0..100. 100 when target is 0. */
  percent: number;
  /** ceil(remaining / monthly) when monthly > 0 and not reached; 0 when reached; else null. */
  monthsToGoal: number | null;
  /** currentMonth + monthsToGoal (first contribution happens next month), or null. */
  reachMonth: MonthKey | null;
  /** targetMonth - currentMonth when a deadline is set, else null. */
  monthsLeft: number | null;
  /**
   * ceil(remaining / monthsLeft) when deadline set and monthsLeft > 0; remaining when the deadline is later this
   * month (monthsLeft 0) or past-due; else null.
   */
  neededPerMonth: Cents | null;
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

  let monthsToGoal: number | null = null;
  if (reached) monthsToGoal = 0;
  else if (monthly > 0) monthsToGoal = ceilDiv(remaining, monthly);
  const reachMonth = monthsToGoal === null ? null : addMonthsToKey(currentMonth, monthsToGoal);

  let neededPerMonth: Cents | null = null;
  let status: GoalStatus;
  if (monthsLeft !== null) {
    if (monthsLeft > 0) neededPerMonth = ceilDiv(remaining, monthsLeft);
    else if (!reached) neededPerMonth = remaining;
  }
  // Only a date that has actually gone by is past due; a deadline later this month still needs the rest now.
  const pastDue = goal.targetDate !== null && compareISO(goal.targetDate, today) < 0;
  if (reached) status = 'reached';
  else if (monthsLeft !== null) {
    if (pastDue) status = 'past-due';
    else status = monthly >= (neededPerMonth ?? 0) ? 'on-track' : 'behind';
  } else status = monthly > 0 ? 'no-deadline' : 'no-contribution';

  return { remaining, percent, monthsToGoal, reachMonth, monthsLeft, neededPerMonth, status };
}
