/// <reference lib="dom" />
// Shared fixtures and helpers for the Budget E2E suite (WebKit + iPhone profiles).
//
// - Every test fails on any console.error / uncaught page error (auto fixture `consoleGuard`).
// - Service workers are blocked by default (option `serviceWorkers`); the offline spec allows them.
// - Time is frozen at Thu Oct 8 2026, 10:00 America/Chicago unless a test says otherwise.
// - Always navigate relatively (`./`) so the suite also runs against the live sub-path URL (BASE_URL).
import { readFileSync } from 'node:fs';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { Bill, BudgetData, Debt, Goal, Income, Settings, SpendingCategory } from '../src/types';

export { expect };

export const STORAGE_KEY = 'budget.data';
/** localStorage key that marks a device as having entered the access code (see src/lib/access.ts). */
export const DEVICE_KEY = 'budget.device';
/** The configured access-code hash (null when no code is set). The code itself is never in the repo. */
export const ACCESS_HASH: string | null = (
  JSON.parse(readFileSync(new URL('../src/access.json', import.meta.url), 'utf8')) as { hash: string | null }
).hash;
export const TODAY = '2026-10-08';
/** Thu Oct 8 2026, 10:00 in America/Chicago (CDT, UTC-5). */
export const NOW = new Date('2026-10-08T15:00:00Z');
/** Tue Nov 3 2026, 10:00 in America/Chicago (CST, UTC-6) — next month, for the "paid" reset. */
export const NEXT_MONTH = new Date('2026-11-03T16:00:00Z');

/** Console messages that are not app bugs. */
const IGNORED_CONSOLE: RegExp[] = [
  // Our own `serviceWorkers: 'block'` setting makes registration fail on purpose.
  /blocked by Playwright/i,
];

interface Fixtures {
  /** Collected console errors / page errors; asserted empty after each test. */
  consoleErrors: string[];
  consoleGuard: void;
  /** Option: start as a brand-new device that hasn't entered the access code yet (default: already unlocked). */
  locked: boolean;
  deviceAccess: void;
}

export const test = base.extend<Fixtures>({
  // Still an option (inherits from the base fixture), so a spec can `test.use({ serviceWorkers: 'allow' })`.
  serviceWorkers: 'block',
  locked: [false, { option: true }],
  // Every test runs as a device that already entered the access code, unless it asks for `locked: true`.
  deviceAccess: [
    async ({ page, locked }, provide) => {
      if (!locked && ACCESS_HASH) {
        await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [DEVICE_KEY, ACCESS_HASH] as const);
      }
      await provide();
    },
    { auto: true },
  ],
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    // E2E_FAIL_ON_WARNINGS=1 also fails on console.warn (stricter audit runs).
    const failOn = process.env.E2E_FAIL_ON_WARNINGS ? ['error', 'warning'] : ['error'];
    page.on('console', (m) => {
      if (!failOn.includes(m.type())) return;
      const text = m.text();
      if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
      errors.push(`console.${m.type()}: ${text}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await provide(errors);
  },
  consoleGuard: [
    async ({ consoleErrors }, provide, testInfo) => {
      // These are long user flows. With ~12 WebKit workers in parallel every action takes ~0.5–1 s,
      // so the 30 s default is too tight for a 40-step flow. Triple it (a real hang still fails).
      testInfo.setTimeout(testInfo.timeout * 3);
      await provide();
      expect(consoleErrors, 'no console errors or uncaught exceptions during the test').toEqual([]);
    },
    { auto: true },
  ],
});

// ---------------------------------------------------------------------------------------------
// Data builders (integer cents, local ISO dates)

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function income(over: Partial<Income> = {}): Income {
  return {
    id: nextId('inc'),
    name: 'Paycheck',
    amount: 200_000,
    frequency: 'monthly',
    payDate: '2026-10-15',
    semimonthlyDays: [1, 15],
    ...over,
  };
}

export function bill(over: Partial<Bill> = {}): Bill {
  const dueDay = over.dueDay ?? 1;
  return {
    id: nextId('bill'),
    name: 'Rent',
    emoji: '🏠',
    amount: 80_000,
    frequency: 'monthly',
    dueDay,
    dueDate: `2026-10-${String(dueDay).padStart(2, '0')}`,
    paidMonth: null,
    ...over,
  };
}

export function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: nextId('debt'),
    name: 'Credit Card',
    type: 'credit',
    balance: 300_000,
    rateBps: 2499,
    minPayment: 10_000,
    dueDay: 22,
    ...over,
  };
}

export function spending(over: Partial<SpendingCategory> = {}): SpendingCategory {
  return { id: nextId('sp'), name: 'Groceries', emoji: '🛒', monthly: 30_000, kind: 'need', ...over };
}

export function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: nextId('goal'),
    name: 'Trip',
    emoji: '✈️',
    target: 100_000,
    saved: 20_000,
    monthly: 10_000,
    targetDate: null,
    isEmergencyFund: false,
    ...over,
  };
}

export function budget(
  parts: Partial<Omit<BudgetData, 'settings' | 'schemaVersion'>> = {},
  settings: Partial<Settings> = {},
): BudgetData {
  return {
    schemaVersion: 1,
    incomes: parts.incomes ?? [],
    bills: parts.bills ?? [],
    debts: parts.debts ?? [],
    spending: parts.spending ?? [],
    goals: parts.goals ?? [],
    settings: {
      payoffMethod: 'avalanche',
      extraDebtPayment: 0,
      theme: 'system',
      onboarded: true,
      isExample: false,
      lastBackupAt: null,
      ...settings,
    },
  };
}

/**
 * The "standard" budget most tests start from. Monthly numbers:
 *   income $2,000 · bills $860 (Rent $800 + Phone $60) · debt $100 · spending $400 · savings $100
 *   → Left over $540.
 */
export function standardBudget(): BudgetData {
  return budget({
    incomes: [income()],
    bills: [bill(), bill({ name: 'Phone', emoji: '📱', amount: 6_000, dueDay: 20 })],
    debts: [debt()],
    spending: [spending(), spending({ name: 'Fun Money', emoji: '🎉', monthly: 10_000, kind: 'fun' })],
    goals: [goal()],
  });
}

// ---------------------------------------------------------------------------------------------
// Page helpers

/**
 * Freeze the clock, optionally seed saved data, and open the app.
 * Seeding happens once per tab (a sessionStorage flag), so reloads keep whatever the app saved.
 */
export async function openApp(page: Page, data?: BudgetData | null, opts: { now?: Date } = {}): Promise<void> {
  await page.clock.setFixedTime(opts.now ?? NOW);
  if (data) await seed(page, data);
  await page.goto('./');
}

export async function seed(page: Page, data: BudgetData | string): Promise<void> {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      localStorage.setItem(key, value);
      sessionStorage.setItem('e2e.seeded', '1');
    },
    [STORAGE_KEY, json] as const,
  );
}

/** What the app has saved right now. */
export async function stored(page: Page): Promise<BudgetData> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(raw, 'saved budget data').not.toBeNull();
  return JSON.parse(raw as string) as BudgetData;
}

export type TabName = 'Home' | 'Money In' | 'Bills' | 'Savings & Fun' | 'Debt';

export async function goTab(page: Page, name: TabName): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: name === 'Home' ? 'October' : name })).toBeVisible();
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

/** The open bottom sheet (by test id, e.g. 'bill-sheet'). */
export function sheet(page: Page, testId: string): Locator {
  return page.getByTestId(testId);
}

/** The open confirm dialog. */
export function dialog(page: Page): Locator {
  return page.getByRole('alertdialog');
}

/** The newest toast's Undo button (toasts can stack). */
export function undoButton(page: Page): Locator {
  return page.getByRole('status').getByRole('button', { name: 'Undo' }).last();
}

/**
 * A field's inline error: the field is marked invalid and its accessible description starts with the
 * plain-English message (the error is linked with aria-describedby, so VoiceOver reads it with the field).
 */
export async function expectFieldError(field: Locator, message: string): Promise<void> {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await expect(field).toHaveAccessibleDescription(new RegExp(`^${escaped}(\\s|$)`));
}

export async function expectNoFieldError(field: Locator): Promise<void> {
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
}

/** Assert a money element's exact value via its data-cents attribute (web-first, retries). */
export async function expectCents(locator: Locator, cents: number): Promise<void> {
  await expect(locator).toHaveAttribute('data-cents', String(cents));
}

export async function centsOf(locator: Locator): Promise<number> {
  const v = await locator.getAttribute('data-cents');
  expect(v, 'data-cents attribute').not.toBeNull();
  return Number(v);
}

/** "$1,234.56" / "≈ $3,142" / "-$12" → integer cents. */
export function parseMoney(text: string): number {
  const m = /(-)?\$([\d,]+)(?:\.(\d{2}))?/.exec(text.replace(/\s+/g, ''));
  if (!m) throw new Error(`No money amount in "${text}"`);
  const cents = Number(m[2].replace(/,/g, '')) * 100 + Number(m[3] ?? '0');
  return m[1] ? -cents : cents;
}

/** Home breakdown parts (whole-dollar cents) and the take-home total. */
export async function homeBreakdown(page: Page): Promise<{ parts: Record<string, number>; income: number }> {
  const parts: Record<string, number> = {};
  for (const k of ['bills', 'debt', 'savings', 'spending', 'leftOver']) {
    parts[k] = await centsOf(page.getByTestId(`breakdown-${k}`));
  }
  return { parts, income: await centsOf(page.getByTestId('breakdown-income')) };
}

/** Home: the breakdown adds up to take-home pay, and the big number matches the "Left over" part. */
export async function expectHomeAddsUp(page: Page): Promise<void> {
  await expect(page.getByTestId('breakdown-income')).toBeVisible();
  const { parts, income: total } = await homeBreakdown(page);
  const sum = parts.bills + parts.debt + parts.savings + parts.spending + parts.leftOver;
  expect(sum, `breakdown ${JSON.stringify(parts)} adds up to take-home`).toBe(total);
  expect(await centsOf(page.getByTestId('left-over'))).toBe(parts.leftOver);
}

/** Wait for finite CSS animations/transitions (e.g. the page slide-in) to finish. */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
}

/**
 * No horizontal scrolling and nothing cut off at the right edge: the page can't scroll sideways, and no
 * visible element sticks out of the screen (except inside an intentional sideways scroller, or
 * screen-reader-only text). The app's scroll area hides sideways overflow, so cut-off content is
 * checked element by element.
 */
export async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  await settleAnimations(page);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const shell = new Set<Element | null>([document.body, doc, document.getElementById('root'), document.querySelector('main'), document.querySelector('.app')]);
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= vw + 1 && rect.left >= -1) continue;
      let excused = false;
      for (let p: HTMLElement | null = el; p && !shell.has(p); p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.clip !== 'auto' || cs.visibility === 'hidden' || cs.opacity === '0') excused = true;
        else if (p !== el && (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden' || cs.overflowX === 'clip')) {
          const pr = p.getBoundingClientRect();
          if (pr.right <= vw + 1 && pr.left >= -1) excused = true;
        }
        if (excused) break;
      }
      if (!excused) {
        const cls = typeof el.className === 'string' ? el.className : '';
        offenders.push(`<${el.tagName.toLowerCase()} class="${cls}"> ${Math.round(rect.left)}..${Math.round(rect.right)}: ${(el.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return { vw, docScroll: doc.scrollWidth, docClient: doc.clientWidth, offenders: offenders.slice(0, 6) };
  });
  expect(r.docScroll, `${where}: page scrollWidth ${r.docScroll} > ${r.docClient}`).toBeLessThanOrEqual(r.docClient);
  expect(r.offenders, `${where}: elements sticking out of the ${r.vw}px screen`).toEqual([]);
}

/**
 * Pick a visually-hidden radio (segmented control / choice list) the way a finger does: tap its label.
 * Then confirm it is checked.
 */
export async function choose(scope: Page | Locator, name: string | RegExp): Promise<void> {
  const opts = { name, exact: typeof name === 'string' ? true : undefined };
  // `has` is matched inside each label, so it must be a page-rooted locator.
  await scope.locator('label').filter({ has: pageOf(scope).getByRole('radio', opts) }).click();
  await expect(scope.getByRole('radio', opts)).toBeChecked();
}

/** Turn an iOS-style switch on by tapping its row, then confirm it is on. */
export async function switchOn(scope: Page | Locator, name: string): Promise<void> {
  await scope.locator('label').filter({ has: pageOf(scope).getByRole('switch', { name, exact: true }) }).click();
  await expect(scope.getByRole('switch', { name, exact: true })).toBeChecked();
}

function pageOf(scope: Page | Locator): Page {
  return 'page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page);
}
