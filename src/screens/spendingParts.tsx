import { IconWarning } from '../components/Icons';
import { ProgressBar } from '../components/ProgressBar';
import { addDays, formatDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import type { CategorySpend } from '../lib/spending';
import type { ISODate, SpendingCategory } from '../types';

/** localStorage key: the spending category the last purchase was logged to (the log sheet starts there). */
const LAST_CATEGORY_KEY = 'budget.lastSpendCategory';

/** 'week' or 'month', for "this week" / "a month". */
export function periodWord(period: SpendingCategory['period']): 'week' | 'month' {
  return period === 'week' ? 'week' : 'month';
}

/** "$13 left this week" / "$3 over this month". */
export function leftText(spend: CategorySpend, period: SpendingCategory['period']): string {
  const w = periodWord(period);
  return spend.over ? `${formatMoney(-spend.left)} over this ${w}` : `${formatMoney(spend.left)} left this ${w}`;
}

/** How full the bar is: what's spent out of the budget (full once it's all spent). */
function spentPercent(spend: CategorySpend): number {
  if (spend.budget <= 0) return spend.spent > 0 ? 100 : 0;
  return (Math.min(spend.spent, spend.budget) * 100) / spend.budget;
}

/**
 * This week's or month's status with a small bar: "This week: $13 left of $25", or (with a warning icon, so it never
 * relies on color) "$3 over this week ($28 spent of $25)".
 */
export function SpendStatus({
  name,
  period,
  spend,
  testId,
}: {
  name: string;
  period: SpendingCategory['period'];
  spend: CategorySpend;
  testId?: string;
}) {
  const w = periodWord(period);
  return (
    <div className={`spend-status${spend.over ? ' spend-status--over' : ''}`}>
      <p className="spend-status__text" data-testid={testId} data-cents={spend.left}>
        {spend.over ? (
          <>
            <IconWarning size={16} />
            <span>
              <strong>{formatMoney(-spend.left)} over</strong> this {w} ({formatMoney(spend.spent)} spent of{' '}
              {formatMoney(spend.budget)})
            </span>
          </>
        ) : (
          <span>
            This {w}: <strong>{formatMoney(spend.left)} left</strong> of {formatMoney(spend.budget)}
          </span>
        )}
      </p>
      <ProgressBar
        percent={spentPercent(spend)}
        tone={spend.over ? 'warn' : 'fun'}
        size="sm"
        label={`${name} this ${w}`}
        valueText={`${formatMoney(spend.spent)} of ${formatMoney(spend.budget)} spent`}
      />
    </div>
  );
}

/** Home: "Fun Money … $13 left this week" with a thin bar. */
export function SpendMiniRow({
  category: c,
  spend,
}: {
  category: SpendingCategory;
  spend: CategorySpend;
}) {
  return (
    <li className="home-spend__row" data-testid={`home-spend-${c.id}`} data-cents={spend.left}>
      <div className="home-spend__top">
        <span className="home-spend__name">
          <span aria-hidden="true">{c.emoji} </span>
          {c.name}
        </span>
        <span className={`home-spend__left${spend.over ? ' home-spend__left--over' : ''}`}>
          {spend.over && <IconWarning size={15} />}
          <span>{leftText(spend, c.period)}</span>
        </span>
      </div>
      <ProgressBar
        percent={spentPercent(spend)}
        tone={spend.over ? 'warn' : 'fun'}
        size="sm"
        label={`${c.name} this ${periodWord(c.period)}`}
        valueText={`${formatMoney(spend.spent)} of ${formatMoney(spend.budget)} spent`}
      />
    </li>
  );
}

/** "Today", "Yesterday", or "Sun, Oct 4". */
export function entryDay(d: ISODate, today: ISODate): string {
  if (d === today) return 'Today';
  if (d === addDays(today, -1)) return 'Yesterday';
  return formatDate(d, 'weekday');
}

/** The category the last purchase went to, if this phone remembers one. */
function lastCategory(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_CATEGORY_KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberLastCategory(id: string): void {
  try {
    globalThis.localStorage?.setItem(LAST_CATEGORY_KEY, id);
  } catch {
    // Private mode or storage full: the sheet just starts on the default next time.
  }
}

/**
 * Where the log sheet starts: the category it was opened from, else the last one used, else the first nice-to-have
 * (fun money), else the first.
 */
export function startingCategory(spending: SpendingCategory[], preferred?: string | null): string | null {
  const exists = (id: string | null | undefined): id is string => !!id && spending.some((s) => s.id === id);
  if (exists(preferred)) return preferred;
  const last = lastCategory();
  if (exists(last)) return last;
  return (spending.find((s) => s.kind === 'fun') ?? spending[0])?.id ?? null;
}
