import type { Cents, Goal, ISODate, MonthKey } from '../types';

export type GoalStatus =
  | 'reached' //         saved >= target
  | 'on-track' //        has deadline, monthly >= neededPerMonth
  | 'behind' //          has deadline, monthly < neededPerMonth (incl. monthly = 0)
  | 'past-due' //        deadline month is this month or earlier, not reached
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
  /** ceil(remaining / monthsLeft) when deadline set and monthsLeft > 0; remaining when past-due; else null. */
  neededPerMonth: Cents | null;
  status: GoalStatus;
}

export function projectGoal(goal: Goal, today: ISODate): GoalProjection {
  throw new Error('TODO projectGoal');
}
