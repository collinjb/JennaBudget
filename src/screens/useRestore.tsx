import { useRef, type ChangeEvent } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useBudget } from '../state/store';
import { parseBackup } from '../storage/storage';
import { plural } from './shared';

const EXPORTED_AT_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * "Restore from backup": a hidden file picker → validate → preview what's inside → confirm → replace,
 * with an Undo toast. Render `input` somewhere and call `pick()` from a tap.
 */
export function useRestoreBackup() {
  const { data, actions } = useBudget();
  const confirm = useConfirm();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      await confirm({ title: "Couldn't open that file", message: 'Please try again, or pick a different file.', alert: true });
      return;
    }
    const r = parseBackup(text);
    if (!r.ok) {
      await confirm({ title: "Couldn't use this file", message: r.error, alert: true });
      return;
    }
    const sm = r.summary;
    let when: string | null = null;
    if (sm.exportedAt) {
      const d = new Date(sm.exportedAt);
      if (!Number.isNaN(d.getTime())) when = EXPORTED_AT_FMT.format(d);
    }
    const ok = await confirm({
      title: 'Restore this backup?',
      message: (
        <>
          <p>{when ? `Backup from ${when}. It has:` : 'This backup has:'}</p>
          <ul className="restore-list">
            <li>{plural(sm.incomes, 'paycheck')}</li>
            <li>{plural(sm.bills, 'bill')}</li>
            <li>{plural(sm.debts, 'debt')}</li>
            <li>{plural(sm.spending, 'spending category', 'spending categories')}</li>
            <li>{plural(sm.goals, 'savings goal')}</li>
          </ul>
          <p>It replaces everything on this phone right now.</p>
        </>
      ),
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (!ok) return;
    const previous = data;
    actions.replaceAll(r.data);
    toast.show({ message: 'Backup restored', actionLabel: 'Undo', onAction: () => actions.replaceAll(previous) });
  };

  const input = (
    <input
      ref={ref}
      type="file"
      accept="application/json,.json"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      data-testid="restore-file-input"
      onChange={onFile}
    />
  );

  return { input, pick: () => ref.current?.click() };
}
