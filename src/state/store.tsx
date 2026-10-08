import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { MAX_MONEY_CENTS } from '../lib/money';
import { clearData, loadData, saveData, validateBudget } from '../storage/storage';
import {
  emptyBudget,
  type BudgetData,
  type Cents,
  type CollectionItem,
  type CollectionName,
  type MonthKey,
  type Settings,
} from '../types';

/** 'corrupt' = saved data could not be read; the app shows the recovery screen and does NOT save until resolved. */
export type StoreStatus = 'ready' | 'corrupt';

export interface Removed<K extends CollectionName> {
  collection: K;
  item: CollectionItem<K>;
  index: number;
  /** Planned extra debt payment that was dropped because this was the last debt; Undo puts it back. */
  extraDebtPayment?: Cents;
}

export interface BudgetActions {
  /** Insert (append) or replace (same id) an item. */
  upsert<K extends CollectionName>(collection: K, item: CollectionItem<K>): void;
  /** Remove by id. Returns what was removed so the caller can offer Undo via `restore`. */
  remove<K extends CollectionName>(collection: K, id: string): Removed<K> | null;
  /** Put a removed item back at its old position (Undo). */
  restore<K extends CollectionName>(removed: Removed<K>): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Replace everything (restore backup, apply Smart Plan, load example data, undo a plan). */
  replaceAll(data: BudgetData): void;
  /** Mark a bill paid for `month`, or unpaid with null. */
  setBillPaid(id: string, month: MonthKey | null): void;
  /** Add (or with a negative number, take out) money from a goal's saved amount. Clamped to 0..MAX. */
  addToGoal(id: string, cents: Cents): void;
  /** Erase everything and start over (onboarding shows again). */
  reset(): void;
}

interface StoreValue {
  data: BudgetData;
  status: StoreStatus;
  /** Raw text of unreadable saved data (status 'corrupt'), so it can be offered for download. */
  corruptRaw: string | null;
  /** Why the saved data couldn't be read (status 'corrupt'), e.g. it was saved by a newer version. */
  corruptError: string | null;
  /** 'newer-version' when the saved data came from a newer app (update instead of recovering); else 'damaged'. */
  corruptReason: 'damaged' | 'newer-version' | null;
  /** Last save error (e.g. storage full / private mode), or null. */
  saveError: string | null;
  actions: BudgetActions;
}

const StoreContext = createContext<StoreValue | null>(null);

interface InitialState {
  data: BudgetData;
  status: StoreStatus;
  corruptRaw: string | null;
  corruptError: string | null;
  corruptReason: 'damaged' | 'newer-version' | null;
}

function initialState(): InitialState {
  const result = loadData();
  const fine = { corruptRaw: null, corruptError: null, corruptReason: null };
  if (result.status === 'ok') return { data: result.data, status: 'ready', ...fine };
  if (result.status === 'corrupt') {
    return {
      data: emptyBudget(),
      status: 'corrupt',
      corruptRaw: result.raw,
      corruptError: result.error,
      corruptReason: result.reason,
    };
  }
  return { data: emptyBudget(), status: 'ready', ...fine };
}

/** Once every debt is paid off, a planned extra payment no longer means anything; drop it so it can't come back
 * silently (and quietly lower Left Over) when a new debt is added later. */
function withoutStaleExtra(d: BudgetData): BudgetData {
  if (d.settings.extraDebtPayment > 0 && !d.debts.some((x) => x.balance > 0)) {
    return { ...d, settings: { ...d.settings, extraDebtPayment: 0 } };
  }
  return d;
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [init] = useState(initialState);
  const [data, setData] = useState<BudgetData>(init.data);
  const [status, setStatus] = useState<StoreStatus>(init.status);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Latest data/status for synchronous reads inside actions (so back-to-back actions build on each other).
  const dataRef = useRef(init.data);
  const statusRef = useRef(init.status);

  const markReady = useCallback(() => {
    statusRef.current = 'ready';
    setStatus('ready');
  }, []);

  // Every change is saved right away (but unreadable data is never overwritten until the user resolves it).
  // Memory always holds exactly what storage would keep (validated and tidied), and a change that couldn't be
  // saved is refused instead of kept: keeping it would make every later save fail too.
  const commit = useCallback((next: BudgetData) => {
    const v = validateBudget(next);
    if (!v.ok) {
      setSaveError(`That change couldn't be made because something in it isn't right. ${v.error}`);
      return;
    }
    const clean = withoutStaleExtra(v.data);
    dataRef.current = clean;
    setData(clean);
    if (statusRef.current !== 'ready') return;
    const res = saveData(clean);
    setSaveError(res.ok ? null : res.error);
  }, []);

  const update = useCallback((fn: (d: BudgetData) => BudgetData) => commit(fn(dataRef.current)), [commit]);

  const actions = useMemo<BudgetActions>(
    () => ({
      upsert(collection, item) {
        update((d) => {
          const list = d[collection] as CollectionItem<typeof collection>[];
          const idx = list.findIndex((x) => x.id === item.id);
          const next = idx === -1 ? [...list, item] : list.map((x, i) => (i === idx ? item : x));
          return { ...d, [collection]: next };
        });
      },
      remove(collection, id) {
        const list = dataRef.current[collection] as CollectionItem<typeof collection>[];
        const index = list.findIndex((x) => x.id === id);
        if (index === -1) return null;
        const item = list[index];
        const extraBefore = dataRef.current.settings.extraDebtPayment;
        update((d) => ({ ...d, [collection]: (d[collection] as { id: string }[]).filter((x) => x.id !== id) }));
        // Deleting the last debt drops the planned extra payment; remember it so Undo can put it back.
        const dropped = extraBefore > 0 && dataRef.current.settings.extraDebtPayment === 0;
        return dropped ? { collection, item, index, extraDebtPayment: extraBefore } : { collection, item, index };
      },
      restore(removed) {
        update((d) => {
          const list = d[removed.collection] as CollectionItem<typeof removed.collection>[];
          if (list.some((x) => x.id === removed.item.id)) return d;
          let item = removed.item;
          // Only one safety net: if another one was added meanwhile, the restored goal comes back as a normal goal.
          if (removed.collection === 'goals') {
            const goal = item as CollectionItem<'goals'>;
            if (goal.isEmergencyFund && d.goals.some((g) => g.isEmergencyFund)) {
              item = { ...goal, isEmergencyFund: false } as typeof item;
            }
          }
          const next = [...list];
          next.splice(Math.min(removed.index, next.length), 0, item);
          const settings =
            removed.extraDebtPayment !== undefined && d.settings.extraDebtPayment === 0
              ? { ...d.settings, extraDebtPayment: removed.extraDebtPayment }
              : d.settings;
          return { ...d, [removed.collection]: next, settings };
        });
      },
      updateSettings(patch) {
        update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      },
      replaceAll(next) {
        markReady();
        commit(next);
      },
      setBillPaid(id, month) {
        update((d) => ({ ...d, bills: d.bills.map((b) => (b.id === id ? { ...b, paidMonth: month } : b)) }));
      },
      addToGoal(id, cents) {
        update((d) => ({
          ...d,
          goals: d.goals.map((g) =>
            g.id === id ? { ...g, saved: Math.min(MAX_MONEY_CENTS, Math.max(0, g.saved + cents)) } : g,
          ),
        }));
      },
      reset() {
        clearData();
        markReady();
        commit(emptyBudget());
      },
    }),
    [update, commit, markReady],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      status,
      corruptRaw: init.corruptRaw,
      corruptError: init.corruptError,
      corruptReason: init.corruptReason,
      saveError,
      actions,
    }),
    [data, status, init.corruptRaw, init.corruptError, init.corruptReason, saveError, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useBudget(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useBudget must be used inside <BudgetProvider>');
  return v;
}
