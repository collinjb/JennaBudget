import { isValidISODate, isValidMonthKey, toISODate } from '../lib/dates';
import { MAX_MONEY_CENTS, MAX_RATE_BPS } from '../lib/money';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type Bill,
  type BillFrequency,
  type BudgetData,
  type Debt,
  type DebtType,
  type Goal,
  type Income,
  type IncomeFrequency,
  type ISODate,
  type PayoffMethod,
  type Settings,
  type SpendingCategory,
  type ThemeSetting,
} from '../types';

// Persistence contract. Implemented by the iPhone & PWA agent.
// Storage: localStorage key STORAGE_KEY holds JSON BudgetData. The previous good copy is kept under BACKUP_KEY.

export const STORAGE_KEY = 'budget.data';
export const BACKUP_KEY = 'budget.data.previous';

/** Backup file identity. */
export const BACKUP_APP = 'budget';
export const BACKUP_VERSION = 1;

/** Longest name kept (longer names are cut, not rejected). */
export const MAX_NAME_LENGTH = 60;
/** Most items accepted in one list (protects the app from absurd or hostile files). */
export const MAX_ITEMS_PER_LIST = 1000;
/** Largest backup file accepted, in characters. */
const MAX_BACKUP_CHARS = 5_000_000;

export type LoadResult =
  | { status: 'ok'; data: BudgetData; migrated: boolean }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: string; error: string };

// ---------------------------------------------------------------------------------------------
// localStorage access (every call can throw: private mode, storage disabled, quota)

function getStorage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

/**
 * The raw text most recently read or written that is known to be valid. Lets saveData rotate the
 * previous copy without re-validating it every time.
 */
let lastGoodRaw: string | null = null;

/** True when localStorage can be read and written right now. */
export function isStorageAvailable(): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    const probe = 'budget.__probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Read + migrate + validate. Never throws (localStorage access itself may throw in private mode). */
export function loadData(): LoadResult {
  const s = getStorage();
  if (!s) return { status: 'empty' };
  let raw: string | null;
  try {
    raw = s.getItem(STORAGE_KEY);
  } catch {
    // Storage is blocked. Run with an empty budget; saveData will report why nothing can be saved.
    return { status: 'empty' };
  }
  if (raw === null) return { status: 'empty' };
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    return { status: 'corrupt', raw, error: "Your saved budget couldn't be read. It may have been damaged." };
  }
  const m = migrateInternal(parsed.value);
  const v = validateBudget(m.value);
  if (!v.ok) return { status: 'corrupt', raw, error: v.error };
  lastGoodRaw = raw;
  return { status: 'ok', data: v.data, migrated: m.changed };
}

/** Write data (and rotate the previous good copy into BACKUP_KEY). Never throws. */
export function saveData(data: BudgetData): { ok: true } | { ok: false; error: string } {
  // Never write something that couldn't be loaded back: that would turn one bug into a recovery screen.
  const v = validateBudget(data);
  if (!v.ok) {
    return { ok: false, error: `Your latest change couldn't be saved because something in it isn't right. ${v.error}` };
  }
  const json = JSON.stringify(v.data);
  const s = getStorage();
  if (!s) return { ok: false, error: STORAGE_BLOCKED_MESSAGE };

  try {
    const current = s.getItem(STORAGE_KEY);
    if (current !== null && current !== json && (current === lastGoodRaw || isValidRaw(current))) {
      try {
        s.setItem(BACKUP_KEY, current);
      } catch {
        // Not enough room for two copies: the previous copy is a nice-to-have, the real save is not.
        try {
          s.removeItem(BACKUP_KEY);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    // Reading failed; still try to write below.
  }

  try {
    s.setItem(STORAGE_KEY, json);
    lastGoodRaw = json;
    return { ok: true };
  } catch (e) {
    if (isQuotaError(e)) {
      // Free the previous copy and try once more.
      try {
        s.removeItem(BACKUP_KEY);
        s.setItem(STORAGE_KEY, json);
        lastGoodRaw = json;
        return { ok: true };
      } catch {
        return { ok: false, error: STORAGE_FULL_MESSAGE };
      }
    }
    return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
  }
}

const STORAGE_FULL_MESSAGE =
  "Your latest change couldn't be saved because this phone is out of space for the app's data.";
const STORAGE_BLOCKED_MESSAGE =
  "Your changes can't be saved on this phone right now. Safari may be blocking website data (Settings › Safari).";

function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { name?: unknown; code?: unknown };
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

function isValidRaw(raw: string): boolean {
  const parsed = parseJson(raw);
  return parsed.ok && validateBudget(migrateInternal(parsed.value).value).ok;
}

/** Remove all app data from storage. */
export function clearData(): void {
  lastGoodRaw = null;
  const s = getStorage();
  if (!s) return;
  for (const key of [STORAGE_KEY, BACKUP_KEY]) {
    try {
      s.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** The previous good copy, if one exists and validates (used by the recovery screen). */
export function loadPreviousData(): BudgetData | null {
  const s = getStorage();
  if (!s) return null;
  let raw: string | null;
  try {
    raw = s.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parsed = parseJson(raw);
  if (!parsed.ok) return null;
  const v = validateBudget(migrate(parsed.value));
  return v.ok ? v.data : null;
}

/** Raw text currently saved under STORAGE_KEY (null if none or unreadable). Used by "Save a copy of my data". */
export function readRawData(): string | null {
  const s = getStorage();
  if (!s) return null;
  try {
    return s.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------------------------
// Migration

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const COLLECTIONS = ['incomes', 'bills', 'debts', 'spending', 'goals'] as const;
type Collection = (typeof COLLECTIONS)[number];

/** Defaults for item fields that older or partial data may not have. Required fields have no default. */
const ITEM_DEFAULTS: Record<Collection, Obj> = {
  incomes: { semimonthlyDays: [1, 15] },
  bills: { emoji: '🧾', paidMonth: null },
  debts: { type: 'other' },
  spending: { emoji: '💵', kind: 'need' },
  goals: { emoji: '🎯', saved: 0, monthly: 0, targetDate: null, isEmergencyFund: false },
};

function migrateInternal(raw: unknown): { value: unknown; changed: boolean } {
  if (!isObj(raw)) return { value: raw, changed: false };
  const version = raw.schemaVersion;
  // Future versions and garbage versions pass through untouched; validation explains the problem.
  if (version !== undefined && version !== SCHEMA_VERSION) return { value: raw, changed: false };

  let changed = version === undefined;
  const out: Obj = { ...raw, schemaVersion: SCHEMA_VERSION };

  for (const c of COLLECTIONS) {
    const list = raw[c];
    if (list === undefined) {
      out[c] = [];
      changed = true;
    } else if (Array.isArray(list)) {
      out[c] = list.map((item: unknown) => {
        if (!isObj(item)) return item;
        let filled: Obj | null = null;
        for (const [key, value] of Object.entries(ITEM_DEFAULTS[c])) {
          if (item[key] === undefined) {
            filled ??= { ...item };
            filled[key] = Array.isArray(value) ? [...(value as unknown[])] : value;
          }
        }
        if (filled) changed = true;
        return filled ?? item;
      });
    }
  }

  const hasItems = COLLECTIONS.some((c) => Array.isArray(out[c]) && (out[c] as unknown[]).length > 0);
  if (raw.settings === undefined) {
    // Someone with existing data has clearly been through setup; don't show onboarding again.
    out.settings = { ...DEFAULT_SETTINGS, onboarded: hasItems };
    changed = true;
  } else if (isObj(raw.settings)) {
    const settings: Obj = { ...raw.settings };
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (settings[key] === undefined) {
        settings[key] = key === 'onboarded' ? hasItems : value;
        changed = true;
      }
    }
    out.settings = settings;
  }

  return { value: out, changed };
}

/** Bring older/partial shapes up to the current schema. Unknown input passes through for validation. */
export function migrate(raw: unknown): unknown {
  return migrateInternal(raw).value;
}

// ---------------------------------------------------------------------------------------------
// Validation

class InvalidData extends Error {}

const INCOME_FREQUENCIES: readonly IncomeFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
const BILL_FREQUENCIES: readonly BillFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
const DEBT_TYPES: readonly DebtType[] = ['student', 'credit', 'car', 'personal', 'medical', 'other'];
const SPENDING_KINDS: readonly SpendingCategory['kind'][] = ['need', 'fun'];
const PAYOFF_METHODS: readonly PayoffMethod[] = ['avalanche', 'snowball'];
const THEMES: readonly ThemeSetting[] = ['system', 'light', 'dark'];

const MIN_YEAR = 1900;
const MAX_YEAR = 2999;
/** Earliest / latest date storage accepts. Date inputs should use these as min / max. */
export const MIN_STORED_DATE: ISODate = `${MIN_YEAR}-01-01`;
export const MAX_STORED_DATE: ISODate = `${MAX_YEAR}-12-31`;

function inStoredYears(v: string): boolean {
  const y = Number(v.slice(0, 4));
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

/** Real calendar date in 'YYYY-MM-DD' form between 1900 and 2999 (no Date parsing, so no time-zone surprises). */
export function isStoredISODate(v: unknown): v is ISODate {
  return typeof v === 'string' && isValidISODate(v) && inStoredYears(v);
}

function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && isValidMonthKey(v) && inStoredYears(v);
}

/** Reads one item's fields, throwing InvalidData with a plain-English message on the first problem. */
class Reader {
  constructor(
    private readonly obj: Obj,
    private readonly where: string,
  ) {}

  private fail(problem: string): never {
    throw new InvalidData(`${this.where}: ${problem}`);
  }

  private has(key: string): unknown {
    if (!(key in this.obj) || this.obj[key] === undefined) this.fail(`the ${label(key)} is missing.`);
    return this.obj[key];
  }

  id(): string {
    const v = this.has('id');
    if (typeof v !== 'string' || v.trim() === '' || v.length > 200) this.fail("the id isn't valid.");
    return v;
  }

  name(): string {
    const v = this.has('name');
    if (typeof v !== 'string') this.fail("the name isn't text.");
    return cutText(v.trim(), MAX_NAME_LENGTH);
  }

  emoji(): string {
    const v = this.has('emoji');
    if (typeof v !== 'string' || v.length > 64) this.fail("the icon isn't valid.");
    return v.trim();
  }

  money(key: string): number {
    const v = this.has(key);
    const what = `the ${label(key)}`;
    if (typeof v !== 'number' || !Number.isFinite(v)) this.fail(`${what} isn't a number.`);
    if (v < 0) this.fail(`${what} can't be negative.`);
    if (!Number.isInteger(v)) this.fail(`${what} has a fraction of a cent.`);
    if (v > MAX_MONEY_CENTS) this.fail(`${what} is too large (the most is $9,999,999.99).`);
    return v;
  }

  rate(key: string): number {
    const v = this.has(key);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_RATE_BPS) {
      this.fail('the interest rate must be between 0% and 100%.');
    }
    return v;
  }

  day(key: string): number {
    const v = this.has(key);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 31) {
      this.fail(`the ${label(key)} must be a day of the month from 1 to 31.`);
    }
    return v;
  }

  date(key: string): ISODate {
    const v = this.has(key);
    if (!isStoredISODate(v)) this.fail(`the ${label(key)} isn't a real date.`);
    return v;
  }

  dateOrNull(key: string): ISODate | null {
    const v = this.has(key);
    if (v === null) return null;
    if (!isStoredISODate(v)) this.fail(`the ${label(key)} isn't a real date.`);
    return v;
  }

  monthOrNull(key: string): string | null {
    const v = this.has(key);
    if (v === null) return null;
    if (!isMonthKey(v)) this.fail(`the ${label(key)} isn't a real month.`);
    return v;
  }

  bool(key: string): boolean {
    const v = this.has(key);
    if (typeof v !== 'boolean') this.fail(`the ${label(key)} setting should be yes or no.`);
    return v;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const v = this.has(key);
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      this.fail(`the ${label(key)} isn't one Budget knows.`);
    }
    return v as T;
  }

  dayPair(key: string): [number, number] {
    const v = this.has(key);
    if (!Array.isArray(v) || v.length !== 2) this.fail('the two paydays of the month are missing.');
    const [a, b] = v as unknown[];
    for (const d of [a, b]) {
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 31) {
        this.fail('the paydays must be days of the month from 1 to 31.');
      }
    }
    const x = a as number;
    const y = b as number;
    return x <= y ? [x, y] : [y, x];
  }
}

/** Field names in plain English for error messages. */
const FIELD_LABELS: Record<string, string> = {
  id: 'id',
  name: 'name',
  emoji: 'icon',
  amount: 'amount',
  frequency: 'how-often choice',
  payDate: 'payday',
  semimonthlyDays: 'paydays',
  dueDay: 'due day',
  dueDate: 'due date',
  paidMonth: '"paid" month',
  type: 'kind of debt',
  balance: 'balance',
  rateBps: 'interest rate',
  minPayment: 'minimum payment',
  monthly: 'monthly amount',
  kind: 'must-have / nice-to-have choice',
  target: 'goal amount',
  saved: 'amount saved',
  targetDate: 'target date',
  isEmergencyFund: 'safety net',
  payoffMethod: 'payoff method',
  extraDebtPayment: 'extra debt payment',
  theme: 'theme',
  onboarded: 'setup finished',
  isExample: 'example budget',
  lastBackupAt: 'last backup date',
};

function label(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** Cut to at most `max` characters without splitting an emoji. */
function cutText(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd();
}

const LIST_LABELS: Record<Collection, { one: string; many: string }> = {
  incomes: { one: 'Paycheck', many: 'paychecks' },
  bills: { one: 'Bill', many: 'bills' },
  debts: { one: 'Debt', many: 'debts' },
  spending: { one: 'Spending category', many: 'spending categories' },
  goals: { one: 'Savings goal', many: 'savings goals' },
};

function readList<T>(root: Obj, c: Collection, readItem: (r: Reader) => T): T[] {
  const list = root[c];
  const { one, many } = LIST_LABELS[c];
  if (!Array.isArray(list)) throw new InvalidData(`The list of ${many} is missing or damaged.`);
  if (list.length > MAX_ITEMS_PER_LIST) throw new InvalidData(`There are too many ${many} (the most is ${MAX_ITEMS_PER_LIST}).`);
  const seen = new Set<string>();
  return list.map((item: unknown, i) => {
    const n = i + 1;
    if (!isObj(item)) throw new InvalidData(`${one} ${n} is damaged.`);
    const name = typeof item.name === 'string' && item.name.trim() ? ` ("${cutText(item.name.trim(), 30)}")` : '';
    const result = readItem(new Reader(item, `${one} ${n}${name}`)) as T & { id: string };
    if (seen.has(result.id)) throw new InvalidData(`${one} ${n}${name} has the same id as another one of your ${many}.`);
    seen.add(result.id);
    return result;
  });
}

function readIncome(r: Reader): Income {
  return {
    id: r.id(),
    name: r.name(),
    amount: r.money('amount'),
    frequency: r.oneOf('frequency', INCOME_FREQUENCIES),
    payDate: r.date('payDate'),
    semimonthlyDays: r.dayPair('semimonthlyDays'),
  };
}

function readBill(r: Reader): Bill {
  return {
    id: r.id(),
    name: r.name(),
    emoji: r.emoji(),
    amount: r.money('amount'),
    frequency: r.oneOf('frequency', BILL_FREQUENCIES),
    dueDay: r.day('dueDay'),
    dueDate: r.date('dueDate'),
    paidMonth: r.monthOrNull('paidMonth'),
  };
}

function readDebt(r: Reader): Debt {
  return {
    id: r.id(),
    name: r.name(),
    type: r.oneOf('type', DEBT_TYPES),
    balance: r.money('balance'),
    rateBps: r.rate('rateBps'),
    minPayment: r.money('minPayment'),
    dueDay: r.day('dueDay'),
  };
}

function readSpending(r: Reader): SpendingCategory {
  return {
    id: r.id(),
    name: r.name(),
    emoji: r.emoji(),
    monthly: r.money('monthly'),
    kind: r.oneOf('kind', SPENDING_KINDS),
  };
}

function readGoal(r: Reader): Goal {
  return {
    id: r.id(),
    name: r.name(),
    emoji: r.emoji(),
    target: r.money('target'),
    saved: r.money('saved'),
    monthly: r.money('monthly'),
    targetDate: r.dateOrNull('targetDate'),
    isEmergencyFund: r.bool('isEmergencyFund'),
  };
}

function readSettings(root: Obj): Settings {
  const s = root.settings;
  if (!isObj(s)) throw new InvalidData('The settings are missing or damaged.');
  const r = new Reader(s, 'Settings');
  return {
    payoffMethod: r.oneOf('payoffMethod', PAYOFF_METHODS),
    extraDebtPayment: r.money('extraDebtPayment'),
    theme: r.oneOf('theme', THEMES),
    onboarded: r.bool('onboarded'),
    isExample: r.bool('isExample'),
    lastBackupAt: r.dateOrNull('lastBackupAt'),
  };
}

/**
 * Strictly validate (after migrate): every field present with the right type, money fields are
 * non-negative integers <= MAX_MONEY_CENTS, dates are valid ISO dates, enums are known values,
 * days are 1..31, ids are unique non-empty strings, names are strings (trimmed, max 60 chars).
 * Returns a cleaned copy.
 *
 * Cleaning (never an error): names are trimmed and cut to 60 characters, unknown fields are dropped,
 * twice-a-month paydays are sorted, and only the first goal marked as the safety net keeps that mark.
 */
export function validateBudget(raw: unknown): { ok: true; data: BudgetData } | { ok: false; error: string } {
  try {
    if (!isObj(raw)) throw new InvalidData("This isn't Budget data.");
    const version = raw.schemaVersion;
    if (typeof version === 'number' && Number.isInteger(version) && version > SCHEMA_VERSION) {
      throw new InvalidData('This was saved by a newer version of Budget. Update the app, then try again.');
    }
    if (version !== SCHEMA_VERSION) throw new InvalidData("The data's version number isn't one Budget knows.");

    const goals = readList(raw, 'goals', readGoal);
    let hasEmergencyFund = false;
    for (const g of goals) {
      if (g.isEmergencyFund) {
        if (hasEmergencyFund) g.isEmergencyFund = false;
        hasEmergencyFund = true;
      }
    }

    const data: BudgetData = {
      schemaVersion: SCHEMA_VERSION,
      incomes: readList(raw, 'incomes', readIncome),
      bills: readList(raw, 'bills', readBill),
      debts: readList(raw, 'debts', readDebt),
      spending: readList(raw, 'spending', readSpending),
      goals,
      settings: readSettings(raw),
    };
    return { ok: true, data };
  } catch (e) {
    if (e instanceof InvalidData) return { ok: false, error: e.message };
    return { ok: false, error: 'Something in the data is damaged.' };
  }
}

// ---------------------------------------------------------------------------------------------
// Backups

export interface BackupSummary {
  incomes: number;
  bills: number;
  debts: number;
  spending: number;
  goals: number;
  /** ISO timestamp from the file, or null if absent. */
  exportedAt: string | null;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: BudgetData;
}

/**
 * Backup file = { app: 'budget', version: 1, exportedAt: ISO timestamp, data: BudgetData }.
 * `data.settings.lastBackupAt` is set to `today` (the date of this backup).
 */
export function makeBackup(data: BudgetData, today: ISODate): { filename: string; json: string } {
  const dated = isStoredISODate(today);
  // The file records itself as the latest backup, so restoring it doesn't say "You haven't made a backup yet".
  const saved = dated ? { ...data, settings: { ...data.settings, lastBackupAt: today } } : data;
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: saved };
  const stamp = dated ? `-${today}` : '';
  return { filename: `budget-backup${stamp}.json`, json: `${JSON.stringify(file, null, 2)}\n` };
}

const NOT_A_BACKUP = "This file isn't a Budget backup.";

/** Parse + validate a backup file's text. Also accepts a bare BudgetData object. Plain-English errors. */
export function parseBackup(
  text: string,
): { ok: true; data: BudgetData; summary: BackupSummary } | { ok: false; error: string } {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: `${NOT_A_BACKUP} It's empty.` };
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: `${NOT_A_BACKUP} It's much too big.` };

  const parsed = parseJson(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (!parsed.ok || !isObj(parsed.value)) return { ok: false, error: NOT_A_BACKUP };
  const obj = parsed.value;

  let payload: unknown;
  let exportedAt: string | null = null;
  const looksWrapped = 'app' in obj || ('version' in obj && 'data' in obj);
  if (looksWrapped) {
    if (obj.app !== BACKUP_APP) return { ok: false, error: NOT_A_BACKUP };
    const version = obj.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      return { ok: false, error: NOT_A_BACKUP };
    }
    if (version > BACKUP_VERSION) {
      return {
        ok: false,
        error: 'This backup was made by a newer version of Budget. Update the app, then try again.',
      };
    }
    if (!isObj(obj.data)) return { ok: false, error: 'This backup file is missing your budget.' };
    payload = obj.data;
    if (typeof obj.exportedAt === 'string' && obj.exportedAt.length <= 64) exportedAt = obj.exportedAt;
  } else {
    // A bare BudgetData object (e.g. a copy of the saved data). It must at least look like one,
    // otherwise any JSON file would "restore" as an empty budget.
    const known = ['schemaVersion', 'settings', ...COLLECTIONS];
    if (!known.some((k) => k in obj)) return { ok: false, error: NOT_A_BACKUP };
    payload = obj;
  }

  const v = validateBudget(migrate(payload));
  if (!v.ok) {
    return { ok: false, error: `This backup can't be used because part of it is damaged. ${v.error}` };
  }
  const d = v.data;
  return {
    ok: true,
    data: d,
    summary: {
      incomes: d.incomes.length,
      bills: d.bills.length,
      debts: d.debts.length,
      spending: d.spending.length,
      goals: d.goals.length,
      exportedAt,
    },
  };
}

/**
 * Hand a text file to the user: the iPhone share sheet (Save to Files, AirDrop, Mail…) when it can
 * share files, otherwise a normal download. Must be called directly from a tap handler (the share
 * sheet needs a fresh user gesture). Never throws.
 */
export async function shareOrDownloadFile(
  filename: string,
  text: string,
  title: string,
  type = 'application/json',
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const file = makeFile(text, filename, type);
  if (file && nav && canShareFile(nav, file)) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      // Only "sharing isn't allowed here" falls back to a download. Closing the sheet (AbortError) is a cancel, and a
      // share sheet that's already opening (InvalidStateError, e.g. a double tap) must not also start a download.
      if (!isErrorNamed(e, 'NotAllowedError', 'TypeError')) return 'cancelled';
    }
  }
  return downloadText(filename, text, type) ? 'downloaded' : 'cancelled';
}

function makeFile(text: string, filename: string, type: string): File | null {
  try {
    return new File([text], filename, { type });
  } catch {
    return null;
  }
}

function canShareFile(nav: Navigator, file: File): boolean {
  try {
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function isErrorNamed(e: unknown, ...names: string[]): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name = (e as { name?: unknown }).name;
  return typeof name === 'string' && names.includes(name);
}

/** Download text as a file via a temporary <a download>. Returns false if the browser can't. */
export function downloadText(filename: string, text: string, type = 'application/json'): boolean {
  try {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc || typeof URL.createObjectURL !== 'function') return false;
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser time to start reading the file before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** iPhone share sheet with a File when supported, else a download. */
export async function shareOrDownloadBackup(
  data: BudgetData,
  today: ISODate,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { filename, json } = makeBackup(data, today);
  return shareOrDownloadFile(filename, json, 'Budget backup');
}

/** navigator.storage.persist() when available. Never throws. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = (globalThis as { navigator?: Navigator }).navigator?.storage;
    if (!storage || typeof storage.persist !== 'function') return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

/** Local 'YYYY-MM-DD' for file names. */
export function localDateStamp(now: Date = new Date()): ISODate {
  return toISODate(now);
}

const EXPORTED_AT_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Oct 3, 2026" (the phone's local date) from a backup's `exportedAt` timestamp; null when missing or unreadable. */
export function formatExportedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : EXPORTED_AT_FMT.format(new Date(t));
}

/**
 * A restored budget that has anything in it counts as set up (settings.onboarded = true), so the welcome screen
 * never shows over it and "Skip" there can't wipe it. Returns the same object when nothing needs to change.
 */
export function markOnboardedIfFilled(data: BudgetData): BudgetData {
  const hasItems = COLLECTIONS.some((c) => data[c].length > 0);
  return hasItems && !data.settings.onboarded ? { ...data, settings: { ...data.settings, onboarded: true } } : data;
}
