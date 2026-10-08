import type { Page } from '@playwright/test';
import { choose, expect, expectCents, expectFieldError, expectHomeAddsUp, goTab, openApp, stored, test } from './helpers';

test.describe.configure({ mode: 'parallel' });

/** An onboarding row card, found by its "Remove …" button. */
const row = (page: Page, name: string) =>
  page.locator('.onb-row').filter({ has: page.getByRole('button', { name: `Remove ${name}`, exact: true }) });

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true }).click();
const stepIs = (page: Page, n: number) => expect(page.getByText(`Step ${n} of 4`)).toBeVisible();

test.describe('Onboarding', () => {
  test('first launch shows the welcome screen', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
    await expect(page.getByRole('button', { name: "Let's get started" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Just let me look around with example numbers' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('complete all 4 steps with chips and amounts', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: "Let's get started" }).click();

    // Step 1: pay. Empty pay is an inline error.
    await stepIs(page, 1);
    await next(page);
    await expect(page.getByText('Please enter your take-home pay, or tap Skip.')).toBeVisible();
    await page.getByLabel('Take-home pay (one paycheck)').fill('$1,450');
    await choose(page, /^Every 2 weeks/);
    await page.getByLabel('When is your next payday?').fill('2026-10-09');
    await next(page);

    // Step 2: bills from chips + "Something else".
    await stepIs(page, 2);
    await page.getByRole('button', { name: 'Rent', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Rent', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await row(page, 'Rent').getByLabel('Amount').fill('900');
    await page.getByRole('button', { name: 'Phone', exact: true }).click();
    await row(page, 'Phone').getByLabel('Amount').fill('60');
    await row(page, 'Phone').getByLabel('Due on').selectOption('20');
    await page.getByRole('button', { name: 'Something else' }).click();
    await row(page, 'this bill').getByLabel('Bill name').fill('Water');
    await row(page, 'Water').getByLabel('Amount').fill('40.50');
    // A chip tapped twice removes its row.
    await page.getByRole('button', { name: 'Gym', exact: true }).click();
    await expect(row(page, 'Gym')).toHaveCount(1);
    await page.getByRole('button', { name: 'Gym', exact: true }).click();
    await expect(row(page, 'Gym')).toHaveCount(0);
    await next(page);

    // Step 3: a debt.
    await stepIs(page, 3);
    await page.getByRole('button', { name: 'Credit Card', exact: true }).click();
    const card = row(page, 'Credit Card');
    await card.getByLabel('How much do you owe?').fill('2000');
    await card.getByLabel('Interest rate').fill('22.5');
    await card.getByLabel('Minimum payment').fill('60');
    await next(page);

    // Step 4: spending money and a goal.
    await stepIs(page, 4);
    await page.getByRole('button', { name: 'Groceries', exact: true }).click();
    await row(page, 'Groceries').getByLabel('How much each month?').fill('300');
    await page.getByRole('button', { name: 'Emergency Fund', exact: true }).click();
    await row(page, 'Emergency Fund').getByLabel('How much do you want to save?').fill('1000');
    await row(page, 'Emergency Fund').getByLabel('How much can you put in each month?').fill('50');
    await page.getByRole('button', { name: 'Finish' }).click();

    // Home with the big number filled in.
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    // $1,450 every 2 weeks = $3,141.67/mo; out = $1,000.50 bills + $60 debt + $300 spending + $50 savings.
    // Left over $1,731.17 → whole dollars on Home (largest remainder) = $1,731.
    await expect(page.getByTestId('left-over')).toHaveText('$1,731');
    await expectCents(page.getByTestId('breakdown-income'), 314_200);
    await expectHomeAddsUp(page);

    const d = await stored(page);
    expect(d.settings.onboarded).toBe(true);
    expect(d.incomes).toEqual([
      expect.objectContaining({ name: 'Paycheck', amount: 145_000, frequency: 'biweekly', payDate: '2026-10-09' }),
    ]);
    expect(d.bills.map((b) => [b.name, b.amount, b.dueDay, b.frequency])).toEqual([
      ['Rent', 90_000, 1, 'monthly'],
      ['Phone', 6_000, 20, 'monthly'],
      ['Water', 4_050, 1, 'monthly'],
    ]);
    expect(d.debts).toEqual([
      expect.objectContaining({ name: 'Credit Card', type: 'credit', balance: 200_000, rateBps: 2250, minPayment: 6_000 }),
    ]);
    expect(d.spending).toEqual([expect.objectContaining({ name: 'Groceries', monthly: 30_000, kind: 'need' })]);
    expect(d.goals).toEqual([
      expect.objectContaining({ name: 'Emergency Fund', target: 100_000, saved: 0, monthly: 5_000, isEmergencyFund: true }),
    ]);
  });

  test('"No debt" skips the debt step; twice-a-month pay', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: "Let's get started" }).click();
    await page.getByLabel('Take-home pay (one paycheck)').fill('1000');
    await choose(page, /^Twice a month/);
    await page.getByLabel('First payday').selectOption('1');
    await page.getByLabel('Second payday').selectOption('1');
    await next(page);
    await expect(page.getByText('Please pick two different days.')).toBeVisible();
    await page.getByLabel('Second payday').selectOption('31');
    await next(page);
    await stepIs(page, 2);
    await next(page);
    await stepIs(page, 3);
    await page.getByRole('button', { name: /^No debt/ }).click();
    await stepIs(page, 4);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByTestId('left-over')).toHaveText('$2,000');
    const d = await stored(page);
    expect(d.incomes[0]).toEqual(expect.objectContaining({ frequency: 'semimonthly', semimonthlyDays: [1, 31] }));
    expect(d.debts).toEqual([]);
  });

  test('Skip on every step finishes with an empty budget', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: "Let's get started" }).click();
    for (const n of [1, 2, 3, 4]) {
      await stepIs(page, n);
      // Something typed and then skipped is not kept.
      if (n === 1) await page.getByLabel('Take-home pay (one paycheck)').fill('1234');
      await page.getByRole('button', { name: 'Skip', exact: true }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add your paycheck' })).toBeVisible();
    const d = await stored(page);
    expect(d.settings.onboarded).toBe(true);
    expect([d.incomes, d.bills, d.debts, d.spending, d.goals]).toEqual([[], [], [], [], []]);
  });

  test('"example numbers" loads the example budget', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Just let me look around with example numbers' }).click();
    await expect(page.getByText("You're looking at example numbers")).toBeVisible();
    await expect(page.getByTestId('left-over')).toBeVisible();
    await expectHomeAddsUp(page);
    const d = await stored(page);
    expect(d.settings.isExample).toBe(true);
    expect(d.incomes.length).toBeGreaterThan(0);
    expect(d.bills.length).toBeGreaterThan(0);
    expect(d.debts.length).toBeGreaterThan(0);
    expect(d.goals.length).toBeGreaterThan(0);
    await goTab(page, 'Bills');
    await expect(page.getByRole('checkbox', { name: 'Rent paid' })).toBeVisible();
  });

  test('Back keeps what was typed and returns to the welcome screen', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: "Let's get started" }).click();
    await page.getByLabel('Take-home pay (one paycheck)').fill('1450');
    await next(page);
    await stepIs(page, 2);
    await page.getByRole('button', { name: 'Rent', exact: true }).click();
    await row(page, 'Rent').getByLabel('Amount').fill('900');
    await next(page);
    await stepIs(page, 3);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await stepIs(page, 2);
    await expect(row(page, 'Rent').getByLabel('Amount')).toHaveValue('900');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await stepIs(page, 1);
    await expect(page.getByLabel('Take-home pay (one paycheck)')).toHaveValue('1450');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
  });

  test('a bad amount in a row blocks Next with an inline error', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: "Let's get started" }).click();
    await page.getByLabel('Take-home pay (one paycheck)').fill('1450');
    await next(page);
    await page.getByRole('button', { name: 'Rent', exact: true }).click();
    await next(page);
    await expectFieldError(row(page, 'Rent').getByLabel('Amount'), 'Please enter an amount');
    await row(page, 'Rent').getByLabel('Amount').fill('12abc');
    await next(page);
    await expectFieldError(row(page, 'Rent').getByLabel('Amount'), 'Please enter an amount like 25 or 25.50');
    await stepIs(page, 2);
  });
});
