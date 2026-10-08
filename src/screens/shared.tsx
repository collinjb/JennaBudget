import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { formatMonth } from '../lib/dates';
import type { Option } from '../components/Select';
import { FREQUENCY_LABELS, type AnyFrequency } from '../lib/frequency';
import { extraPaycheckMonths } from '../lib/schedule';
import { useBudget } from '../state/store';
import type { CollectionName, Income, MonthKey } from '../types';

/** "every 2 weeks", "twice a month", "once a year" */
export function freqText(f: AnyFrequency): string {
  return FREQUENCY_LABELS[f].toLowerCase();
}

/** Choices for a "How often?" picker, worded the same everywhere ("Every 2 weeks", "Every month", …). */
export function frequencyOptions<T extends AnyFrequency>(freqs: readonly T[]): Option<T>[] {
  return freqs.map((value) => ({ value, label: FREQUENCY_LABELS[value] }));
}

/** plural(3, 'bill') => '3 bills' */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Wrap a name in curly quotes for messages. */
export function q(name: string): string {
  return `“${name}”`;
}

/**
 * Delete flow used everywhere: confirm → remove → "Deleted" toast with Undo (7 s, paused while touched).
 * Resolves true when the item was deleted.
 */
export function useDeleteWithUndo() {
  const { actions } = useBudget();
  const confirm = useConfirm();
  const toast = useToast();
  return async (collection: CollectionName, id: string, name: string): Promise<boolean> => {
    const ok = await confirm({
      title: `Delete ${q(name)}?`,
      message: 'You can undo this right after.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return false;
    const removed = actions.remove(collection, id);
    if (!removed) return false;
    toast.show({
      message: `Deleted ${q(name)}`,
      actionLabel: 'Undo',
      onAction: () => actions.restore(removed),
    });
    return true;
  };
}

/**
 * The next month (within a year) with an extra payday for every-week / every-2-weeks pay, as one
 * friendly sentence: "Heads up: you get 3 paychecks in January!" Null when there is none.
 */
export function extraPaycheckHeadsUp(incomes: Income[], month: MonthKey): string | null {
  const found = incomes
    .filter((i) => i.frequency === 'weekly' || i.frequency === 'biweekly')
    .map((i) => ({ income: i, first: extraPaycheckMonths(i, month, 12)[0] }))
    .filter((x): x is { income: Income; first: { month: MonthKey; count: number } } => !!x.first);
  if (found.length === 0) return null;
  const earliest = found.reduce((a, b) => (a.first.month <= b.first.month ? a : b)).first.month;
  const group = found.filter((x) => x.first.month === earliest);
  const when = earliest === month ? 'this month' : `in ${formatMonth(earliest, 'month')}`;
  const count = group[0].first.count;
  if (incomes.length === 1) return `Heads up: you get ${count} paychecks ${when}!`;
  if (group.length > 1 && group.every((g) => g.first.count === count)) return `Heads up: you get ${count} paydays ${when}!`;
  return `Heads up: ${group[0].income.name} pays ${count} times ${when}!`;
}
