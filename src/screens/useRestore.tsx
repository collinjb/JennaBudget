import { useRef, type ChangeEvent } from 'react';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useBudget } from '../state/store';
import { formatExportedAt, markOnboardedIfFilled, parseBackup } from '../storage/storage';
import { plural } from './shared';

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
    const when = formatExportedAt(sm.exportedAt);
    const ok = await confirm({
      title: 'Restore this backup?',
      message: (
        <>
          <p>{when ? `Backup from ${when}. It has:` : 'This backup has:'}</p>
          <ul className="restore-list" role="list">
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
    // A backup with anything in it counts as set up, so the welcome screen can't show over it (or wipe it).
    actions.replaceAll(markOnboardedIfFilled(r.data));
    toast.show({
      message: 'Backup restored',
      actionLabel: 'Undo',
      onAction: () => actions.replaceAll(previous),
      dismissOnChange: true,
    });
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
