import { useRef, useState, type ChangeEvent } from 'react';
import { useBudget } from '../state/store';
import { loadPreviousData, parseBackup, type BackupSummary } from '../storage/storage';
import type { BudgetData } from '../types';
import { saveCopyMessage, saveCopyOfData } from './saveCopy';
import './pwa.css';

/** Largest file we'll try to read (a real backup is a few KB). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 paychecks, 5 bills, 1 debt, …" (skips empty lists; "nothing yet" when everything is empty). */
export function describeContents(c: Omit<BackupSummary, 'exportedAt'>): string {
  const parts = [
    c.incomes ? plural(c.incomes, 'paycheck', 'paychecks') : '',
    c.bills ? plural(c.bills, 'bill', 'bills') : '',
    c.debts ? plural(c.debts, 'debt', 'debts') : '',
    c.spending ? plural(c.spending, 'spending category', 'spending categories') : '',
    c.goals ? plural(c.goals, 'savings goal', 'savings goals') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no items yet';
}

function countsOf(d: BudgetData): Omit<BackupSummary, 'exportedAt'> {
  return {
    incomes: d.incomes.length,
    bills: d.bills.length,
    debts: d.debts.length,
    spending: d.spending.length,
    goals: d.goals.length,
  };
}

/** "Oct 3, 2026" from a backup's ISO timestamp (null if missing or unreadable). */
function formatExportedAt(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Shown instead of the app when saved data can't be read (useBudget().status === 'corrupt').
 * Nothing is overwritten until the user picks one of the options.
 */
export function RecoveryScreen() {
  const { corruptRaw, actions } = useBudget();
  const [previous] = useState(() => loadPreviousData());
  const [picked, setPicked] = useState<{ data: BudgetData; summary: BackupSummary } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still triggers a change
    setPicked(null);
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError("This file is too big to be a Budget backup.");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileError("That file couldn't be opened. Try picking it again.");
      return;
    }
    const res = parseBackup(text);
    if (res.ok) setPicked({ data: res.data, summary: res.summary });
    else setFileError(res.error);
  };

  const saveUnreadable = async () => {
    try {
      setNote(saveCopyMessage(await saveCopyOfData(corruptRaw)));
    } catch {
      setNote("Sorry, the copy couldn't be saved.");
    }
  };

  const pickedDate = picked ? formatExportedAt(picked.summary.exportedAt) : null;

  return (
    <main className="pwa-screen">
      <div className="pwa-screen__inner">
        <header className="pwa-header">
          <div className="pwa-hero" aria-hidden="true">
            🧰
          </div>
          <h1 className="pwa-title">We couldn't open your budget</h1>
          <p className="pwa-text">
            Your saved budget couldn't be read. This can happen after a storage problem on the phone. Nothing has
            been erased. Choose what you'd like to do:
          </p>
        </header>

        {previous && (
          <section className="pwa-card" aria-labelledby="pwa-rec-prev">
            <h2 className="pwa-card__title" id="pwa-rec-prev">
              Restore the last good copy
            </h2>
            <p className="pwa-text">
              Budget keeps the version from just before your last change. It has {describeContents(countsOf(previous))}.
            </p>
            <button type="button" className="pwa-btn pwa-btn--primary" onClick={() => actions.replaceAll(previous)}>
              Restore the last good copy
            </button>
          </section>
        )}

        <section className="pwa-card" aria-labelledby="pwa-rec-file">
          <h2 className="pwa-card__title" id="pwa-rec-file">
            Restore from a backup file
          </h2>
          <p className="pwa-text">Pick a backup you saved before, for example in the Files app or iCloud Drive.</p>
          <input
            ref={fileInput}
            className="pwa-visually-hidden"
            type="file"
            accept="application/json,.json"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void onFile(e)}
          />
          {!picked && (
            <button
              type="button"
              className={`pwa-btn ${previous ? 'pwa-btn--secondary' : 'pwa-btn--primary'}`}
              onClick={() => fileInput.current?.click()}
            >
              Choose a backup file
            </button>
          )}
          {fileError && (
            <p className="pwa-error" role="alert">
              {fileError}
            </p>
          )}
          {picked && (
            <div className="pwa-preview" role="status">
              <p className="pwa-text">
                This backup{pickedDate ? ` from ${pickedDate}` : ''} has {describeContents(picked.summary)}.
              </p>
              <div className="pwa-actions">
                <button type="button" className="pwa-btn pwa-btn--primary" onClick={() => actions.replaceAll(picked.data)}>
                  Restore this backup
                </button>
                <button type="button" className="pwa-btn pwa-btn--secondary" onClick={() => setPicked(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {corruptRaw !== null && corruptRaw !== '' && (
          <section className="pwa-card" aria-labelledby="pwa-rec-save">
            <h2 className="pwa-card__title" id="pwa-rec-save">
              Save the unreadable data
            </h2>
            <p className="pwa-text">Keep a copy of it, just in case someone can rescue it later.</p>
            <button type="button" className="pwa-btn pwa-btn--secondary" onClick={() => void saveUnreadable()}>
              Save the unreadable data
            </button>
            {note && (
              <p className="pwa-note" role="status">
                {note}
              </p>
            )}
          </section>
        )}

        <section className="pwa-card" aria-labelledby="pwa-rec-fresh">
          <h2 className="pwa-card__title" id="pwa-rec-fresh">
            Start fresh
          </h2>
          {!confirmFresh ? (
            <>
              <p className="pwa-text">Erase what's saved in the app on this phone and set up a new budget.</p>
              <button type="button" className="pwa-btn pwa-btn--danger" onClick={() => setConfirmFresh(true)}>
                Start fresh
              </button>
            </>
          ) : (
            <div className="pwa-confirm" role="alertdialog" aria-labelledby="pwa-rec-fresh-q">
              <p className="pwa-text pwa-text--strong" id="pwa-rec-fresh-q">
                Erase everything and start over? This can't be undone. If you might need the old data, save a copy
                first.
              </p>
              <div className="pwa-actions">
                <button type="button" className="pwa-btn pwa-btn--danger-solid" onClick={() => actions.reset()}>
                  Yes, erase and start fresh
                </button>
                <button type="button" className="pwa-btn pwa-btn--secondary" onClick={() => setConfirmFresh(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
