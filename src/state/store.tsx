import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MAX_MONEY_CENTS } from '../lib/money';
import { clearData, loadData, saveData } from '../storage/storage';
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
  /** Last save error (e.g. storage full / private mode), or null. */
  saveError: string | null;
  actions: BudgetActions;
}

const StoreContext = createContext<StoreValue | null>(null);

function initialState(): { data: BudgetData; status: StoreStatus; corruptRaw: string | null } {
  const result = loadData();
  if (result.status === 'ok') return { data: result.data, status: 'ready', corruptRaw: null };
  if (result.status === 'corrupt') return { data: emptyBudget(), status: 'corrupt', corruptRaw: result.raw };
  return { data: emptyBudget(), status: 'ready', corruptRaw: null };
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [init] = useState(initialState);
  const [data, setData] = useState<BudgetData>(init.data);
  const [status, setStatus] = useState<StoreStatus>(init.status);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Latest data for synchronous reads inside actions (kept in sync by `update`).
  const dataRef = useRef(init.data);
  const skipFirstSave = useRef(true);

  // Persist every change (but never overwrite unreadable data until the user resolves it).
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    if (status !== 'ready') return;
    const res = saveData(data);
    setSaveError(res.ok ? null : res.error);
  }, [data, status]);

  const update = useCallback((fn: (d: BudgetData) => BudgetData) => {
    setData((d) => {
      const next = fn(d);
      dataRef.current = next;
      return next;
    });
  }, []);

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
        update((d) => ({ ...d, [collection]: (d[collection] as { id: string }[]).filter((x) => x.id !== id) }));
        return { collection, item, index };
      },
      restore(removed) {
        update((d) => {
          const list = d[removed.collection] as CollectionItem<typeof removed.collection>[];
          if (list.some((x) => x.id === removed.item.id)) return d;
          const next = [...list];
          next.splice(Math.min(removed.index, next.length), 0, removed.item);
          return { ...d, [removed.collection]: next };
        });
      },
      updateSettings(patch) {
        update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      },
      replaceAll(next) {
        update(() => next);
        setStatus('ready');
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
        update(() => emptyBudget());
        setStatus('ready');
      },
    }),
    [update],
  );

  const value = useMemo<StoreValue>(
    () => ({ data, status, corruptRaw: init.corruptRaw, saveError, actions }),
    [data, status, init.corruptRaw, saveError, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useBudget(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useBudget must be used inside <BudgetProvider>');
  return v;
}
