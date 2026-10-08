import { IconCheck, IconWarning } from '../components/Icons';
import { formatDate, formatMonth, monthKey } from '../lib/dates';
import type { GoalProjection } from '../lib/goals';
import { formatMoney } from '../lib/money';
import type { Goal } from '../types';

/** The one-line status under a goal, in plain words (a reached goal's 🎉 is added, decoratively, by GoalStatusLine). */
export function goalStatusText(goal: Goal, p: GoalProjection): string {
  const deadline = goal.targetDate ? formatMonth(monthKey(goal.targetDate)) : '';
  switch (p.status) {
    case 'reached':
      return 'You did it!';
    case 'on-track':
      return `On track for ${deadline}`;
    case 'behind':
      // Deadline later this month: there's only this month left, so name the day and skip "/month".
      if (p.monthsLeft === 0 && goal.targetDate) {
        return `To reach ${formatMoney(goal.target)} by ${formatDate(goal.targetDate, 'short')}, save ${formatMoney(p.neededPerMonth ?? 0)} this month`;
      }
      return `To reach ${formatMoney(goal.target)} by ${deadline}, save ${formatMoney(p.neededPerMonth ?? 0)}/month`;
    case 'past-due':
      return 'This date has passed. Pick a new one?';
    case 'no-deadline':
      return p.reachMonth
        ? `At ${formatMoney(goal.monthly)}/month you'll reach this by ${formatMonth(p.reachMonth)}`
        : 'Add a monthly amount to see when you\'ll get there';
    case 'no-contribution':
      return "Add a monthly amount to see when you'll get there";
  }
}

export function GoalStatusLine({
  goal,
  projection,
  compact,
}: {
  goal: Goal;
  projection: GoalProjection;
  compact?: boolean;
}) {
  const s = projection.status;
  const warn = s === 'behind' || s === 'past-due';
  const good = s === 'on-track' || s === 'reached';
  return (
    <p className={`goal-status${warn ? ' goal-status--warn' : ''}${good ? ' goal-status--good' : ''}${compact ? ' goal-status--compact' : ''}`}>
      {warn && <IconWarning size={16} />}
      {s === 'on-track' && <IconCheck size={16} />}
      <span>
        {s === 'reached' && <span aria-hidden="true">🎉 </span>}
        {goalStatusText(goal, projection)}
      </span>
    </p>
  );
}
