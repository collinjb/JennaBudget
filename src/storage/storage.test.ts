import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBudget, type BudgetData } from '../types';
import {
  BACKUP_KEY,
  MAX_STORED_DATE,
  MIN_STORED_DATE,
  STORAGE_KEY,
  clearData,
  formatExportedAt,
  isStorageAvailable,
  loadData,
  loadPreviousData,
  localDateStamp,
  makeBackup,
  markOnboardedIfFilled,
  migrate,
  parseBackup,
  readRawData,
  requestPersistentStorage,
  saveData,
  shareOrDownloadBackup,
  validateBudget,
} from './storage';

// ---------------------------------------------------------------------------------------------
// In-memory localStorage (the test environment is node)

class MemoryStorage implements Storage {
  map = new Map<string, string>();
  failGet = false;
  failSet: false | 'security' | 'quota' = false;
  /** Max total characters before setItem throws QuotaExceededError. */
  quota = Infinity;
  [name: string]: unknown;

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(key: string): string | null {
    if (this.failGet) throw new DOMException('The operation is insecure.', 'SecurityError');
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failSet === 'security') throw new DOMException('The operation is insecure.', 'SecurityError');
    if (this.failSet === 'quota') throw new DOMException('Quota exceeded.', 'QuotaExceededError');
    let size = String(value).length;
    for (const [k, v] of this.map) if (k !== key) size += v.length;
    if (size > this.quota) throw new DOMException('Quota exceeded.', 'QuotaExceededError');
    this.map.set(key, String(value));
  }
}

let store: MemoryStorage;

function installStorage(s: unknown) {
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });
}

beforeEach(() => {
  store = new MemoryStorage();
  installStorage(store);
  clearData();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// Sample data

function sample(): BudgetData {
  return {
    schemaVersion: 1,
    incomes: [
      {
        id: 'inc-1',
        name: 'Job',
        amount: 145_000,
        frequency: 'biweekly',
        payDate: '2026-10-10',
        semimonthlyDays: [1, 15],
      },
      {
        id: 'inc-2',
        name: 'Side gig 🎨',
        amount: 30_050,
        frequency: 'semimonthly',
        payDate: '2026-10-01',
        semimonthlyDays: [15, 31],
      },
    ],
    bills: [
      {
        id: 'bill-1',
        name: 'Rent',
        emoji: '🏠',
        amount: 90_000,
        frequency: 'monthly',
        dueDay: 1,
        dueDate: '2026-10-01',
        paidMonth: '2026-10',
      },
      {
        id: 'bill-2',
        name: 'Car insurance',
        emoji: '🚗',
        amount: 36_000,
        frequency: 'quarterly',
        dueDay: 31,
        dueDate: '2026-01-31',
        paidMonth: null,
      },
    ],
    debts: [
      {
        id: 'debt-1',
        name: 'Credit Card',
        type: 'credit',
        balance: 250_000,
        rateBps: 2499,
        minPayment: 7_500,
        dueDay: 20,
        monthPaid: null,
      },
      { id: 'debt-2', name: 'Student Loan', type: 'student', balance: 1_200_000, rateBps: 0, minPayment: 0, dueDay: 31, monthPaid: null },
    ],
    spending: [
      { id: 'sp-1', name: 'Groceries', emoji: '🛒', monthly: 40_000, kind: 'need' },
      { id: 'sp-2', name: 'Fun Money', emoji: '🎉', monthly: 10_000, kind: 'fun' },
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Emergency Fund',
        emoji: '🛟',
        target: 100_000,
        saved: 25_000,
        monthly: 5_000,
        targetDate: null,
        isEmergencyFund: true,
        monthDeposit: null,
      },
      {
        id: 'goal-2',
        name: 'Trip to Florida',
        emoji: '🏖️',
        target: 150_000,
        saved: 40_000,
        monthly: 15_000,
        targetDate: '2027-05-01',
        isEmergencyFund: false,
        monthDeposit: null,
      },
    ],
    settings: {
      payoffMethod: 'snowball',
      extraDebtPayment: 5_000,
      theme: 'dark',
      onboarded: true,
      isExample: false,
      lastBackupAt: '2026-10-03',
    },
  };
}

// Tests deliberately break the data, so they need a loosely typed copy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** Deep clone as a loose object so tests can break it. */
function loose(data: BudgetData = sample()): Record<string, Json> {
  return JSON.parse(JSON.stringify(data)) as Record<string, Json>;
}

function expectInvalid(raw: unknown) {
  const res = validateBudget(raw);
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error.length).toBeGreaterThan(5);
    expect(res.error).not.toMatch(/undefined|null|NaN|\[object/);
  }
  return res.ok ? '' : res.error;
}

// ---------------------------------------------------------------------------------------------

describe('load / save', () => {
  it('returns empty when nothing is saved', () => {
    expect(loadData()).toEqual({ status: 'empty' });
  });

  it('round-trips data exactly', () => {
    const data = sample();
    expect(saveData(data)).toEqual({ ok: true });
    const res = loadData();
    expect(res).toEqual({ status: 'ok', data, migrated: false });
  });

  it('round-trips an empty budget', () => {
    expect(saveData(emptyBudget()).ok).toBe(true);
    expect(loadData()).toEqual({ status: 'ok', data: emptyBudget(), migrated: false });
  });

  it('reports unreadable JSON as corrupt and keeps the raw text', () => {
    store.setItem(STORAGE_KEY, '{"incomes": [');
    const res = loadData();
    expect(res.status).toBe('corrupt');
    if (res.status === 'corrupt') {
      expect(res.raw).toBe('{"incomes": [');
      expect(res.error).toMatch(/couldn't be read/);
    }
  });

  it('reports parseable but invalid data as corrupt with a plain-English reason', () => {
    const bad = loose();
    bad.bills[0].amount = -5;
    store.setItem(STORAGE_KEY, JSON.stringify(bad));
    const res = loadData();
    expect(res.status).toBe('corrupt');
    if (res.status === 'corrupt') {
      expect(res.error).toBe('Bill 1 ("Rent"): the amount can\'t be negative.');
      expect(res.reason).toBe('damaged');
    }
  });

  it('tells data from a newer version apart from damaged data', () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ ...loose(), schemaVersion: 999 }));
    const res = loadData();
    expect(res.status).toBe('corrupt');
    if (res.status === 'corrupt') expect(res.reason).toBe('newer-version');
    store.setItem(STORAGE_KEY, '{"incomes": [');
    const broken = loadData();
    if (broken.status === 'corrupt') expect(broken.reason).toBe('damaged');
  });

  it('treats an empty stored string as corrupt, not as a new budget', () => {
    store.setItem(STORAGE_KEY, '');
    expect(loadData().status).toBe('corrupt');
  });

  it('refuses to save invalid data and leaves the saved copy alone', () => {
    const good = sample();
    saveData(good);
    const bad = loose(good) as unknown as BudgetData;
    (bad.bills[0] as { amount: number }).amount = 12.5;
    const res = saveData(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/couldn't be saved.*fraction of a cent/);
    expect(loadData()).toEqual({ status: 'ok', data: good, migrated: false });
  });

  it('clearData removes the data and the previous copy', () => {
    saveData(sample());
    saveData({ ...sample(), bills: [] });
    expect(store.getItem(BACKUP_KEY)).not.toBeNull();
    clearData();
    expect(store.getItem(STORAGE_KEY)).toBeNull();
    expect(store.getItem(BACKUP_KEY)).toBeNull();
    expect(loadData()).toEqual({ status: 'empty' });
  });

  it('readRawData returns exactly what is stored', () => {
    store.setItem(STORAGE_KEY, 'not json');
    expect(readRawData()).toBe('not json');
  });
});

describe('previous good copy', () => {
  it('rotates the last saved version into the backup key', () => {
    const a = sample();
    const b = { ...sample(), bills: [] };
    saveData(a);
    expect(store.getItem(BACKUP_KEY)).toBeNull();
    saveData(b);
    expect(loadPreviousData()).toEqual(a);
    expect(loadData()).toEqual({ status: 'ok', data: b, migrated: false });
  });

  it('does not overwrite the previous copy when saving identical data', () => {
    const a = sample();
    const b = { ...sample(), debts: [] };
    saveData(a);
    saveData(b);
    saveData(b);
    expect(loadPreviousData()).toEqual(a);
  });

  it('never rotates unreadable data over the previous good copy', () => {
    const a = sample();
    const b = { ...sample(), goals: [] };
    saveData(a);
    saveData(b);
    store.setItem(STORAGE_KEY, '{garbage');
    expect(loadData().status).toBe('corrupt');
    // Recovery: restore the previous copy, which saves over the garbage.
    const prev = loadPreviousData();
    expect(prev).toEqual(a);
    saveData(prev as BudgetData);
    expect(loadPreviousData()).toEqual(a);
    expect(loadData()).toEqual({ status: 'ok', data: a, migrated: false });
  });

  it('rotates a stored copy written by someone else if it is valid', () => {
    const a = sample();
    store.setItem(STORAGE_KEY, JSON.stringify(a));
    saveData({ ...a, spending: [] });
    expect(loadPreviousData()).toEqual(a);
  });

  it('returns null when there is no previous copy or it is unreadable', () => {
    expect(loadPreviousData()).toBeNull();
    store.setItem(BACKUP_KEY, 'nope');
    expect(loadPreviousData()).toBeNull();
    const bad = loose();
    bad.settings.theme = 'neon';
    store.setItem(BACKUP_KEY, JSON.stringify(bad));
    expect(loadPreviousData()).toBeNull();
  });

  it('still saves when there is only room for one copy', () => {
    const a = sample();
    saveData(a);
    store.quota = JSON.stringify(a).length + 50;
    const b = { ...sample(), bills: [] };
    expect(saveData(b)).toEqual({ ok: true });
    expect(loadData()).toEqual({ status: 'ok', data: b, migrated: false });
  });
});

describe('when localStorage misbehaves', () => {
  it('getItem throwing: load is empty, nothing throws', () => {
    store.failGet = true;
    expect(() => loadData()).not.toThrow();
    expect(loadData()).toEqual({ status: 'empty' });
    expect(loadPreviousData()).toBeNull();
    expect(readRawData()).toBeNull();
  });

  it('setItem throwing (storage blocked): friendly error', () => {
    store.failSet = 'security';
    const res = saveData(sample());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/can't be saved/);
    expect(isStorageAvailable()).toBe(false);
  });

  it('quota exceeded: friendly error', () => {
    store.failSet = 'quota';
    const res = saveData(sample());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/out of space/);
  });

  it('localStorage itself missing or throwing on access', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(loadData()).toEqual({ status: 'empty' });
    expect(saveData(sample()).ok).toBe(false);
    expect(() => clearData()).not.toThrow();
    expect(loadPreviousData()).toBeNull();
    expect(isStorageAvailable()).toBe(false);
    installStorage(undefined);
    expect(loadData()).toEqual({ status: 'empty' });
    expect(saveData(sample()).ok).toBe(false);
  });

  it('isStorageAvailable is true for working storage', () => {
    expect(isStorageAvailable()).toBe(true);
    expect(store.length).toBe(0);
  });
});

describe('validateBudget', () => {
  it('accepts valid data and returns an equal, separate copy', () => {
    const data = sample();
    const res = validateBudget(data);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(data);
      expect(res.data).not.toBe(data);
      expect(res.data.bills[0]).not.toBe(data.bills[0]);
    }
  });

  it('accepts edge values: zero, $9,999,999.99, 100%, day 31, Feb 29 in a leap year', () => {
    const d = loose();
    d.incomes[0].amount = 0;
    d.debts[0].balance = 999_999_999;
    d.debts[0].rateBps = 10_000;
    d.bills[0].dueDay = 31;
    d.incomes[0].payDate = '2028-02-29';
    d.goals[1].targetDate = MAX_STORED_DATE;
    d.bills[0].dueDate = MIN_STORED_DATE;
    expect(validateBudget(d).ok).toBe(true);
  });

  it('accepts dates from 1900 through 2999 only', () => {
    for (const [date, ok] of [
      ['1899-12-31', false],
      ['1900-01-01', true],
      ['2999-12-31', true],
      ['3000-01-01', false],
    ] as const) {
      const d = loose();
      d.goals[1].targetDate = date;
      expect(validateBudget(d).ok).toBe(ok);
    }
  });

  it('cleans: trims and shortens names, drops unknown fields, sorts paydays, one safety net', () => {
    const d = loose();
    d.bills[0].name = '   Rent   ';
    d.spending[0].name = '🍎'.repeat(80);
    d.extraTopLevel = true;
    d.bills[0].color = 'red';
    d.settings.legacy = 1;
    d.incomes[1].semimonthlyDays = [31, 15];
    d.goals[1].isEmergencyFund = true;
    const res = validateBudget(d);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.bills[0].name).toBe('Rent');
    expect(Array.from(res.data.spending[0].name)).toHaveLength(60);
    expect(res.data.spending[0].name).toBe('🍎'.repeat(60));
    expect('extraTopLevel' in res.data).toBe(false);
    expect('color' in res.data.bills[0]).toBe(false);
    expect('legacy' in res.data.settings).toBe(false);
    expect(res.data.incomes[1].semimonthlyDays).toEqual([15, 31]);
    expect(res.data.goals.map((g) => g.isEmergencyFund)).toEqual([true, false]);
  });

  const cases: [string, (d: Record<string, Json>) => unknown][] = [
    ['root is null', () => null],
    ['root is an array', () => []],
    ['root is a string', () => 'budget'],
    ['missing schemaVersion (unmigrated)', (d) => (delete d.schemaVersion, d)],
    ['schemaVersion as text', (d) => ((d.schemaVersion = '1'), d)],
    ['schemaVersion 0', (d) => ((d.schemaVersion = 0), d)],
    ['negative money', (d) => ((d.bills[0].amount = -100), d)],
    ['negative goal saved', (d) => ((d.goals[0].saved = -1), d)],
    ['fractional cents', (d) => ((d.incomes[0].amount = 1450.5), d)],
    ['money too large', (d) => ((d.debts[0].balance = 1_000_000_000), d)],
    ['money as text', (d) => ((d.spending[0].monthly = '400'), d)],
    ['money NaN (serialized as null)', (d) => ((d.goals[0].target = null), d)],
    ['money Infinity', (d) => ((d.settings.extraDebtPayment = Infinity), d)],
    ['impossible date', (d) => ((d.incomes[0].payDate = '2026-02-30'), d)],
    ['Feb 29 in a non-leap year', (d) => ((d.incomes[0].payDate = '2027-02-29'), d)],
    ['month 13', (d) => ((d.bills[0].dueDate = '2026-13-01'), d)],
    ['US-style date', (d) => ((d.bills[0].dueDate = '10/08/2026'), d)],
    ['date with time', (d) => ((d.goals[1].targetDate = '2027-05-01T00:00:00Z'), d)],
    ['absurd year', (d) => ((d.incomes[0].payDate = '0001-01-01'), d)],
    ['bad paidMonth', (d) => ((d.bills[0].paidMonth = '2026-13'), d)],
    ['bad lastBackupAt', (d) => ((d.settings.lastBackupAt = 'yesterday'), d)],
    ['unknown income frequency', (d) => ((d.incomes[0].frequency = 'daily'), d)],
    ['unknown bill frequency', (d) => ((d.bills[0].frequency = 'fortnightly'), d)],
    ['unknown debt type', (d) => ((d.debts[0].type = 'mortgage'), d)],
    ['unknown spending kind', (d) => ((d.spending[0].kind = 'want'), d)],
    ['unknown payoff method', (d) => ((d.settings.payoffMethod = 'random'), d)],
    ['unknown theme', (d) => ((d.settings.theme = 'blue'), d)],
    ['duplicate ids', (d) => ((d.bills[1].id = d.bills[0].id), d)],
    ['empty id', (d) => ((d.debts[0].id = '  '), d)],
    ['numeric id', (d) => ((d.goals[0].id = 7), d)],
    ['name is a number', (d) => ((d.incomes[0].name = 42), d)],
    ['emoji is a number', (d) => ((d.bills[0].emoji = 1), d)],
    ['boolean as text', (d) => ((d.goals[0].isEmergencyFund = 'yes'), d)],
    ['onboarded missing', (d) => (delete d.settings.onboarded, d)],
    ['due day 0', (d) => ((d.bills[0].dueDay = 0), d)],
    ['due day 32', (d) => ((d.debts[0].dueDay = 32), d)],
    ['due day 1.5', (d) => ((d.bills[0].dueDay = 1.5), d)],
    ['rate above 100%', (d) => ((d.debts[0].rateBps = 10_001), d)],
    ['negative rate', (d) => ((d.debts[0].rateBps = -1), d)],
    ['fractional basis points', (d) => ((d.debts[0].rateBps = 6.5), d)],
    ['semimonthly days not a pair', (d) => ((d.incomes[0].semimonthlyDays = [1]), d)],
    ['semimonthly day 0', (d) => ((d.incomes[0].semimonthlyDays = [0, 15]), d)],
    ['list is an object', (d) => ((d.bills = {}), d)],
    ['list missing', (d) => (delete d.debts, d)],
    ['item is not an object', (d) => ((d.goals[0] = 'goal'), d)],
    ['item is null', (d) => ((d.spending[0] = null), d)],
    ['settings null', (d) => ((d.settings = null), d)],
    ['settings missing', (d) => (delete d.settings, d)],
    ['missing amount', (d) => (delete d.bills[0].amount, d)],
    ['missing rate', (d) => (delete d.debts[0].rateBps, d)],
    ['missing payDate', (d) => (delete d.incomes[0].payDate, d)],
    ['missing name', (d) => (delete d.goals[0].name, d)],
    ['too many items', (d) => ((d.bills = Array.from({ length: 1001 }, (_, i) => ({ ...d.bills[0], id: `b${i}` }))), d)],
  ];

  it.each(cases)('rejects: %s', (_label, mutate) => {
    expectInvalid(mutate(loose()));
  });

  it('explains problems in plain English, naming the item', () => {
    const d = loose();
    d.debts[0].rateBps = 20_000;
    expect(expectInvalid(d)).toBe('Debt 1 ("Credit Card"): the interest rate must be between 0% and 100%.');
    const e = loose();
    e.bills[1].id = 'bill-1';
    expect(expectInvalid(e)).toBe('Bill 2 ("Car insurance") has the same id as another one of your bills.');
    const f = loose();
    delete f.incomes[0].amount;
    expect(expectInvalid(f)).toBe('Paycheck 1 ("Job"): the amount is missing.');
    const g = loose();
    g.schemaVersion = 2;
    expect(expectInvalid(g)).toMatch(/newer version of Budget/);
  });
});

describe('migrate', () => {
  function legacy(): Record<string, Json> {
    // An early shape: no schemaVersion, no settings, and optional fields missing.
    return {
      incomes: [{ id: 'i1', name: 'Job', amount: 100_000, frequency: 'monthly', payDate: '2026-10-01' }],
      bills: [{ id: 'b1', name: 'Phone', amount: 6_000, frequency: 'monthly', dueDay: 12, dueDate: '2026-10-12' }],
      debts: [{ id: 'd1', name: 'Card', balance: 50_000, rateBps: 1999, minPayment: 2_500, dueDay: 5 }],
      spending: [{ id: 's1', name: 'Gas', monthly: 12_000 }],
      goals: [{ id: 'g1', name: 'Car', target: 500_000 }],
    };
  }

  it('upgrades a schemaVersion-less object and fills defaults', () => {
    const input = legacy();
    const snapshot = JSON.stringify(input);
    const res = validateBudget(migrate(input));
    expect(JSON.stringify(input)).toBe(snapshot); // input not mutated
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const d = res.data;
    expect(d.schemaVersion).toBe(1);
    expect(d.incomes[0].semimonthlyDays).toEqual([1, 15]);
    expect(d.bills[0]).toMatchObject({ emoji: '🧾', paidMonth: null });
    expect(d.debts[0].type).toBe('other');
    expect(d.spending[0]).toMatchObject({ emoji: '💵', kind: 'need' });
    expect(d.goals[0]).toMatchObject({ emoji: '🎯', saved: 0, monthly: 0, targetDate: null, isEmergencyFund: false });
    expect(d.settings).toEqual({
      payoffMethod: 'avalanche',
      extraDebtPayment: 0,
      theme: 'system',
      onboarded: true, // they already have data, so skip onboarding
      isExample: false,
      lastBackupAt: null,
    });
  });

  it('loadData reports migrated: true for old data and the next save writes the new shape', () => {
    store.setItem(STORAGE_KEY, JSON.stringify(legacy()));
    const res = loadData();
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.migrated).toBe(true);
    saveData(res.data);
    expect(JSON.parse(store.getItem(STORAGE_KEY) as string).schemaVersion).toBe(1);
    // The old copy is kept as the previous copy and still loads.
    expect(loadPreviousData()).toEqual(res.data);
  });

  it('an empty legacy object becomes an empty budget that still shows onboarding', () => {
    const res = validateBudget(migrate({}));
    expect(res).toEqual({ ok: true, data: emptyBudget() });
  });

  it('fills missing settings fields of current-version data', () => {
    const d = loose();
    delete d.settings.lastBackupAt;
    delete d.settings.theme;
    const res = validateBudget(migrate(d));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.settings).toMatchObject({ lastBackupAt: null, theme: 'system', onboarded: true });
  });

  it('still rejects missing required fields after migration', () => {
    const d = legacy();
    delete d.bills[0].amount;
    expect(validateBudget(migrate(d)).ok).toBe(false);
  });

  it('passes through things it cannot migrate', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('x')).toBe('x');
    const arr: unknown[] = [];
    expect(migrate(arr)).toBe(arr);
    const future = { schemaVersion: 99, incomes: 'whatever' };
    expect(migrate(future)).toBe(future);
    expect(validateBudget(migrate(future)).ok).toBe(false);
  });

  it('does not report migration for current data', () => {
    saveData(sample());
    const res = loadData();
    expect(res.status === 'ok' && res.migrated).toBe(false);
  });
});

/** What a backup made on `date` contains: the same data, with that date as the last backup. */
function backedUp(data: BudgetData, date: string): BudgetData {
  return { ...data, settings: { ...data.settings, lastBackupAt: date } };
}

describe('backups', () => {
  it('makeBackup: dated filename and the documented wrapper', () => {
    const data = sample();
    const { filename, json } = makeBackup(data, '2026-10-08');
    expect(filename).toBe('budget-backup-2026-10-08.json');
    const file = JSON.parse(json);
    expect(file.app).toBe('budget');
    expect(file.version).toBe(1);
    expect(typeof file.exportedAt).toBe('string');
    expect(Number.isNaN(Date.parse(file.exportedAt))).toBe(false);
    expect(file.data).toEqual(backedUp(data, '2026-10-08'));
  });

  it("a backup records its own date as the last backup (restoring it doesn't forget it)", () => {
    const data = sample();
    expect(data.settings.lastBackupAt).toBe('2026-10-03');
    const res = parseBackup(makeBackup(data, '2026-10-08').json);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.settings.lastBackupAt).toBe('2026-10-08');
    // Nothing else changes, and the data passed in isn't touched.
    expect({ ...res.data, settings: { ...res.data.settings, lastBackupAt: null } }).toEqual({
      ...data,
      settings: { ...data.settings, lastBackupAt: null },
    });
    expect(data.settings.lastBackupAt).toBe('2026-10-03');
  });

  it('backup → parse round-trips exactly (apart from the backup date)', () => {
    const data = sample();
    const res = parseBackup(makeBackup(data, '2026-10-08').json);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual(backedUp(data, '2026-10-08'));
    expect(res.summary).toMatchObject({ incomes: 2, bills: 2, debts: 2, spending: 2, goals: 2 });
    expect(typeof res.summary.exportedAt).toBe('string');
  });

  it('backup → parse → save → load round-trips exactly (apart from the backup date)', () => {
    const data = sample();
    const res = parseBackup(makeBackup(data, '2026-10-08').json);
    if (!res.ok) throw new Error(res.error);
    saveData(res.data);
    expect(loadData()).toEqual({ status: 'ok', data: backedUp(data, '2026-10-08'), migrated: false });
  });

  it('accepts bare BudgetData (e.g. a raw copy of the saved data)', () => {
    const data = sample();
    const res = parseBackup(JSON.stringify(data));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual(data);
      expect(res.summary.exportedAt).toBeNull();
    }
  });

  it('accepts a bare legacy object and migrates it', () => {
    const res = parseBackup(JSON.stringify({ bills: [], goals: [] }));
    expect(res.ok).toBe(true);
  });

  it('accepts a byte-order mark and surrounding whitespace', () => {
    const res = parseBackup(`${String.fromCharCode(0xfeff)}\n  ${makeBackup(sample(), '2026-10-08').json}  \n`);
    expect(res.ok).toBe(true);
  });

  it('rejects a backup from another app', () => {
    const res = parseBackup(JSON.stringify({ app: 'other-budget-app', version: 1, data: sample() }));
    expect(res).toEqual({ ok: false, error: "This file isn't a Budget backup." });
  });

  it('rejects a backup from a newer version', () => {
    const res = parseBackup(JSON.stringify({ app: 'budget', version: 2, exportedAt: 'x', data: sample() }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/newer version of Budget/);
  });

  it('rejects data from a newer schema inside a current wrapper', () => {
    const data = { ...loose(), schemaVersion: 2 };
    const res = parseBackup(JSON.stringify({ app: 'budget', version: 1, data }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/newer version of Budget/);
  });

  it.each([
    ['malformed JSON', '{"app": "budget", '],
    ['empty text', ''],
    ['whitespace', '   '],
    ['a number', '42'],
    ['an array', '[1,2,3]'],
    ['an unrelated object', '{"name": "My recipes", "items": []}'],
    ['a CSV file', 'date,amount\n2026-10-01,12.00'],
    ['bad wrapper version', '{"app": "budget", "version": "one", "data": {}}'],
  ])('rejects %s as not a backup', (_label, text) => {
    const res = parseBackup(text);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^This file isn't a Budget backup\./);
  });

  it('rejects a wrapper without data', () => {
    const res = parseBackup(JSON.stringify({ app: 'budget', version: 1, exportedAt: '2026-10-08T12:00:00Z' }));
    expect(res).toEqual({ ok: false, error: 'This backup file is missing your budget.' });
  });

  it('rejects invalid data with the specific reason', () => {
    const d = loose();
    d.goals[1].saved = -10;
    const res = parseBackup(JSON.stringify({ app: 'budget', version: 1, exportedAt: 'x', data: d }));
    expect(res).toEqual({
      ok: false,
      error: 'This backup can\'t be used because part of it is damaged. Savings goal 2 ("Trip to Florida"): the amount saved can\'t be negative.',
    });
  });

  it('rejects huge files without parsing them', () => {
    const res = parseBackup(`{"x":"${'a'.repeat(5_000_001)}"}`);
    expect(res.ok).toBe(false);
  });
});

describe('shareOrDownloadBackup', () => {
  function fakeDocument() {
    const anchor = { href: '', download: '', rel: '', style: { display: '' }, click: vi.fn(), remove: vi.fn() };
    const doc = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } };
    return { doc, anchor };
  }

  it('uses the share sheet with a JSON file when files can be shared', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    const res = await shareOrDownloadBackup(sample(), '2026-10-08');
    expect(res).toBe('shared');
    const arg = share.mock.calls[0][0];
    expect(arg.title).toBe('Budget backup');
    const file = (arg.files as File[])[0];
    expect(file.name).toBe('budget-backup-2026-10-08.json');
    expect(file.type).toBe('application/json');
    const parsed = parseBackup(await file.text());
    expect(parsed.ok && parsed.data).toEqual(backedUp(sample(), '2026-10-08'));
  });

  it('returns cancelled when the user closes the share sheet', async () => {
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
    });
    expect(await shareOrDownloadBackup(sample(), '2026-10-08')).toBe('cancelled');
  });

  it('falls back to a download when sharing fails for another reason', async () => {
    vi.useFakeTimers();
    const { doc, anchor } = fakeDocument();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('No gesture', 'NotAllowedError')),
    });
    expect(await shareOrDownloadBackup(sample(), '2026-10-08')).toBe('downloaded');
    expect(anchor.download).toBe('budget-backup-2026-10-08.json');
    expect(anchor.href).toMatch(/^blob:/);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it('a share sheet that is already opening (double tap) neither shares again nor downloads', async () => {
    const { doc, anchor } = fakeDocument();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('An earlier share has not yet completed.', 'InvalidStateError')),
    });
    expect(await shareOrDownloadBackup(sample(), '2026-10-08')).toBe('cancelled');
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it('falls back to a download when share() rejects the file type', async () => {
    vi.useFakeTimers();
    const { doc, anchor } = fakeDocument();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.reject(new TypeError('bad data')) });
    expect(await shareOrDownloadBackup(sample(), '2026-10-08')).toBe('downloaded');
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it('downloads when the browser cannot share files', async () => {
    vi.useFakeTimers();
    const { doc, anchor } = fakeDocument();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { canShare: () => false, share: vi.fn() });
    expect(await shareOrDownloadBackup(sample(), '2026-10-08')).toBe('downloaded');
    expect(anchor.click).toHaveBeenCalledOnce();
    vi.stubGlobal('navigator', {});
    expect(await shareOrDownloadBackup(sample(), '2026-10-08')).toBe('downloaded');
  });
});

describe('requestPersistentStorage', () => {
  it('is false when the API is missing', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('is true when already persisted (without asking again)', async () => {
    const persist = vi.fn(async () => false);
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks and reports the answer', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => true } });
    expect(await requestPersistentStorage()).toBe(true);
  });

  it('never throws', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => false,
        persist: async () => {
          throw new Error('nope');
        },
      },
    });
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe('localDateStamp', () => {
  it('formats the local date', () => {
    expect(localDateStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('formatExportedAt', () => {
  it('formats a backup timestamp as a short local date', () => {
    expect(formatExportedAt(new Date(2026, 9, 3, 12).toISOString())).toBe('Oct 3, 2026');
  });
  it('is null when missing or unreadable', () => {
    expect(formatExportedAt(null)).toBeNull();
    expect(formatExportedAt('')).toBeNull();
    expect(formatExportedAt('not a date')).toBeNull();
  });
});

describe('markOnboardedIfFilled', () => {
  it('marks a restored budget with items as set up', () => {
    const d = { ...emptyBudget(), incomes: sample().incomes };
    expect(d.settings.onboarded).toBe(false);
    expect(markOnboardedIfFilled(d).settings.onboarded).toBe(true);
    expect(d.settings.onboarded).toBe(false); // never mutates
  });
  it('leaves an empty budget (and one already set up) as it is', () => {
    const empty = emptyBudget();
    expect(markOnboardedIfFilled(empty)).toBe(empty);
    const done = sample();
    expect(markOnboardedIfFilled(done)).toBe(done);
  });
});
