import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { monthKey, todayISO } from '../lib/dates';
import { startOfMonthBalance } from '../lib/debt';
import { pruneSpendLog } from '../lib/spending';
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
  /** Store generation at removal time: an Undo from before a whole-budget replace must not touch the new budget. */
  generation: number;
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
  /**
   * Add (or with a negative number, take out) money from a goal's saved amount, clamped to 0..MAX, and count it toward
   * `month` (so a dated goal knows how much of this month's amount is in).
   */
  addToGoal(id: string, cents: Cents, month: MonthKey): void;
  /** Log a payment on a debt during `month`: lowers the balance (never below 0) and counts toward this month's goal. */
  payDebt(id: string, cents: Cents, month: MonthKey): void;
  /** Erase everything and start over with an empty budget. */
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
  /** Bumps whenever the whole budget is replaced or reset, so older Undo offers can tell they no longer apply. */
  generation: number;
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
  if (result.status === 'ok') return { data: tidy(result.data), status: 'ready', ...fine };
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
 * silently (and quietly lower Left Over) when a new debt is added later. A debt paid off during this month still
 * counts until the month ends (this month's budget already planned for it). */
/** Housekeeping on every save: drop a stale extra payment and purchases older than about 13 months. */
function tidy(d: BudgetData, today: string = todayISO()): BudgetData {
  const cleaned = withoutStaleExtra(d, monthKey(today));
  const spendLog = pruneSpendLog(cleaned.spendLog, today);
  return spendLog === cleaned.spendLog ? cleaned : { ...cleaned, spendLog };
}

function withoutStaleExtra(d: BudgetData, month: MonthKey = monthKey(todayISO())): BudgetData {
  if (d.settings.extraDebtPayment > 0 && !d.debts.some((x) => startOfMonthBalance(x, month) > 0)) {
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
  const generationRef = useRef(0);
  const [generation, setGeneration] = useState(0);
  const newGeneration = useCallback(() => {
    generationRef.current += 1;
    setGeneration(generationRef.current);
  }, []);

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
    const clean = tidy(v.data);
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
        const generation = generationRef.current;
        return dropped
          ? { collection, item, index, generation, extraDebtPayment: extraBefore }
          : { collection, item, index, generation };
      },
      restore(removed) {
        // Removed before the whole budget was replaced (example data, restore, start over): it doesn't belong here.
        if (removed.generation !== generationRef.current) return;
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
        newGeneration();
        commit(next);
      },
      setBillPaid(id, month) {
        update((d) => ({ ...d, bills: d.bills.map((b) => (b.id === id ? { ...b, paidMonth: month } : b)) }));
      },
      addToGoal(id, cents, month) {
        update((d) => ({
          ...d,
          goals: d.goals.map((g) => {
            if (g.id !== id) return g;
            const saved = Math.min(MAX_MONEY_CENTS, Math.max(0, g.saved + cents));
            const before = g.monthDeposit && g.monthDeposit.month === month ? g.monthDeposit.amount : 0;
            // Count what actually moved (after clamping), so this month's progress always matches the saved amount.
            return { ...g, saved, monthDeposit: { month, amount: before + (saved - g.saved) } };
          }),
        }));
      },
      payDebt(id, cents, month) {
        update((d) => ({
          ...d,
          debts: d.debts.map((x) => {
            if (x.id !== id) return x;
            const balance = Math.max(0, x.balance - Math.max(0, cents));
            const before = x.monthPaid && x.monthPaid.month === month ? x.monthPaid.amount : 0;
            return { ...x, balance, monthPaid: { month, amount: before + (x.balance - balance) } };
          }),
        }));
      },
      reset() {
        clearData();
        markReady();
        newGeneration();
        commit(emptyBudget());
      },
    }),
    [update, commit, markReady, newGeneration],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      status,
      corruptRaw: init.corruptRaw,
      corruptError: init.corruptError,
      corruptReason: init.corruptReason,
      generation,
      saveError,
      actions,
    }),
    [data, status, init.corruptRaw, init.corruptError, init.corruptReason, generation, saveError, actions],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useBudget(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useBudget must be used inside <BudgetProvider>');
  return v;
}
