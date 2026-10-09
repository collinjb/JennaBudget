import { IconCheck, IconWarning } from '../components/Icons';
import { Money } from '../components/Money';
import { ProgressBar } from '../components/ProgressBar';
import { formatDate, formatMonth, monthKey } from '../lib/dates';
import type { GoalProjection } from '../lib/goals';
import { formatMoney } from '../lib/money';
import type { Goal } from '../types';

/** The one-line status under a goal, in plain words (a reached goal's 🎉 is added, decoratively, by GoalStatusLine). */
export function goalStatusText(goal: Goal, p: GoalProjection): string {
  switch (p.status) {
    case 'reached':
      return 'You did it!';
    case 'on-track': {
      // A date later this month: name the day ("by Oct 30"), otherwise the month ("by May 2027").
      const by =
        goal.targetDate && p.monthsLeft === 0
          ? formatDate(goal.targetDate, 'short')
          : goal.targetDate
            ? formatMonth(monthKey(goal.targetDate))
            : '';
      return `Set aside ${formatMoney(p.thisMonth)} this month to reach ${formatMoney(goal.target)} by ${by}.`;
    }
    case 'past-due':
      return 'This date has passed. Pick a new one?';
    case 'no-deadline':
      return p.reachMonth
        ? `At ${formatMoney(goal.monthly)}/month you'll reach this by ${formatMonth(p.reachMonth)}`
        : "Add a monthly amount to see when you'll get there";
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
  const warn = s === 'past-due';
  const good = s === 'reached';
  return (
    <p className={`goal-status${warn ? ' goal-status--warn' : ''}${good ? ' goal-status--good' : ''}${compact ? ' goal-status--compact' : ''}`}>
      {warn && <IconWarning size={16} />}
      <span>
        {s === 'reached' && <span aria-hidden="true">🎉 </span>}
        {goalStatusText(goal, projection)}
      </span>
    </p>
  );
}

/**
 * This month's progress for a goal that takes money this month: "This month: $120 of $300 saved" (with a small bar),
 * or "✓ This month's $300 is saved". Nothing for a reached goal or one with no monthly amount.
 */
export function GoalMonthLine({
  goal,
  projection: p,
  compact,
}: {
  goal: Goal;
  projection: GoalProjection;
  compact?: boolean;
}) {
  if (p.status === 'reached' || p.thisMonth <= 0) return null;
  const saved = Math.max(0, p.savedThisMonth);
  const done = p.thisMonthToGo === 0;
  const testId = `goal-this-month-${goal.id}`;
  if (done) {
    return (
      <p className={`goal-month goal-month--done${compact ? ' goal-month--compact' : ''}`} data-testid={testId}>
        <IconCheck size={16} />
        <span>
          This month's <Money cents={p.thisMonth} /> is saved
        </span>
      </p>
    );
  }
  return (
    <div className={`goal-month${compact ? ' goal-month--compact' : ''}`} data-testid={testId}>
      <p className="goal-month__text">
        This month:{' '}
        <strong>
          <Money cents={saved} />
        </strong>{' '}
        of <Money cents={p.thisMonth} /> saved
      </p>
      {!compact && (
        <ProgressBar
          percent={(saved * 100) / p.thisMonth}
          tone="savings"
          size="sm"
          label={`${goal.name} this month`}
          valueText={`${formatMoney(saved)} of ${formatMoney(p.thisMonth)} saved this month`}
        />
      )}
    </div>
  );
}
