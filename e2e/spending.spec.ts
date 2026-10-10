import type { Page } from '@playwright/test';
import { makeExampleBudget } from '../src/lib/exampleData';
import type { SpendEntry } from '../src/types';
import {
  bill,
  budget,
  centsOf,
  choose,
  dialog,
  expect,
  expectCents,
  expectFieldError,
  expectNoHorizontalScroll,
  goTab,
  income,
  NEXT_MONTH,
  openApp,
  sheet,
  spending,
  stored,
  test,
  TODAY,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

// Today is Thu Oct 8 2026, so this week runs Sun Oct 4 … Sat Oct 10.
/** Sun Oct 11 2026, 10:00 in America/Chicago: the next week. */
const NEXT_SUNDAY = new Date('2026-10-11T15:00:00Z');

let n = 0;
function entry(over: Partial<SpendEntry> = {}): SpendEntry {
  return { id: `e${++n}`, categoryId: 'fun', amount: 1_000, date: TODAY, note: '', ...over };
}

/**
 * Groceries $300 a month (must-have) and Fun Money $25 a week (= $108.33 a month), with "Movies" $12 logged on Sunday.
 * Fun Money starts with $13 left this week; Groceries with $300 left this month.
 */
function spendBudget(log: SpendEntry[] = [entry({ id: 'movies', amount: 1_200, date: '2026-10-04', note: 'Movies' })]) {
  return budget({
    incomes: [income()],
    spending: [
      spending({ id: 'groc', name: 'Groceries', emoji: '🛒', monthly: 30_000, kind: 'need' }),
      spending({ id: 'fun', name: 'Fun Money', emoji: '🎉', monthly: 10_833, kind: 'fun', period: 'week' }),
    ],
    spendLog: log,
  });
}

const logSheet = (page: Page) => sheet(page, 'log-spending-sheet');
const toastText = (page: Page) => page.getByRole('status');

test.describe('Spending log', () => {
  test('log a purchase from Home: what is left this week drops, and Undo puts it back', async ({ page }) => {
    await openApp(page, spendBudget());
    const card = page.getByTestId('home-spending');
    const fun = page.getByTestId('home-spend-fun');
    await expect(fun).toContainText('Fun Money');
    await expect(fun).toContainText('$13 left this week');
    await expect(page.getByTestId('home-spend-groc')).toContainText('$300 left this month');
    const leftOver = await page.getByTestId('left-over').textContent();

    await card.getByRole('button', { name: 'Log spending' }).click();
    const s = logSheet(page);
    await expect(s.getByRole('heading', { name: 'Log spending' })).toBeVisible();
    // The amount comes first and has the cursor; it starts on the fun money.
    const amount = s.getByLabel('How much did you spend?');
    await expect(amount).toBeFocused();
    await expect(s.getByRole('button', { name: 'Fun Money', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByLabel('When?')).toHaveValue(TODAY);
    const preview = s.getByTestId('log-preview');
    await expect(preview).toHaveText('Fun Money has $13 left this week.');
    await amount.fill('4.50');
    await expect(preview).toHaveText('Fun Money has $13 left this week. After this: $8.50 left.');
    await s.getByLabel('What was it for?').fill('Coffee');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expect(s).toBeHidden();

    await expect(toastText(page)).toContainText('Logged $4.50 for Fun Money · $8.50 left this week');
    await expect(fun).toContainText('$8.50 left this week');
    await expectCents(fun, 850);
    // Left over is the plan: spending inside a budget doesn't change it.
    await expect(page.getByTestId('left-over')).toHaveText(leftOver ?? '');
    const d = await stored(page);
    expect(d.spendLog).toHaveLength(2);
    expect(d.spendLog[1]).toEqual(
      expect.objectContaining({ categoryId: 'fun', amount: 450, date: TODAY, note: 'Coffee' }),
    );

    await undoButton(page).click();
    await expect(fun).toContainText('$13 left this week');
    expect((await stored(page)).spendLog.map((e) => e.id)).toEqual(['movies']);
  });

  test('log from a category row, remember the last category, and go over budget', async ({ page }) => {
    await openApp(page, spendBudget());
    await goTab(page, 'Savings & Fun');
    // A weekly category shows its weekly amount; the section total stays monthly.
    await expect(page.getByRole('button', { name: /^Fun Money Nice-to-have \$25 a week/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Groceries Must-have \$300 a month/ })).toBeVisible();
    await expect(page.getByText('$408.33 a month', { exact: true })).toBeVisible();
    const fun = page.getByTestId('spend-status-fun');
    const groc = page.getByTestId('spend-status-groc');
    await expect(fun).toHaveText('This week: $13 left of $25');
    await expect(groc).toHaveText('This month: $300 left of $300');

    // The row's "Log" starts on that category.
    await page.getByRole('button', { name: 'Log spending for Groceries' }).click();
    let s = logSheet(page);
    await expect(s.getByRole('button', { name: 'Groceries', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.getByRole('button', { name: 'Fun Money', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await s.getByLabel('How much did you spend?').fill('40');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expect(s).toBeHidden();
    await expect(toastText(page)).toContainText('Logged $40 for Groceries · $260 left this month');
    await expect(groc).toHaveText('This month: $260 left of $300');
    await expect(page.getByRole('progressbar', { name: 'Groceries this month' })).toHaveAttribute('aria-valuenow', '13');

    // The big "Log spending" button starts on the category used last time.
    await page.getByRole('button', { name: 'Log spending', exact: true }).click();
    s = logSheet(page);
    await expect(s.getByRole('button', { name: 'Groceries', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Pick Fun Money and go over this week's $25.
    await s.getByRole('button', { name: 'Fun Money', exact: true }).click();
    await expect(s.getByRole('button', { name: 'Fun Money', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await s.getByLabel('How much did you spend?').fill('20');
    await expect(s.getByTestId('log-preview')).toHaveText('Fun Money has $13 left this week. After this: $7 over.');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expect(s).toBeHidden();
    await expect(toastText(page)).toContainText('Logged $20 for Fun Money · $7 over this week');
    // Over: a warning icon and words, not just a color.
    await expect(fun).toHaveText('$7 over this week ($32 spent of $25)');
    await expect(fun.locator('svg')).toHaveCount(1);
    await expect(page.getByRole('progressbar', { name: 'Fun Money this week' })).toHaveAttribute('aria-valuenow', '100');
    await expectCents(fun, -700);

    await goTab(page, 'Home');
    await expect(page.getByTestId('home-spend-fun')).toContainText('$7 over this week');
    await expect(page.getByTestId('home-spend-groc')).toContainText('$260 left this month');
  });

  test('a weekly budget starts fresh on Sunday; a monthly one on the 1st', async ({ page }) => {
    await openApp(
      page,
      spendBudget([
        entry({ categoryId: 'fun', amount: 2_000, date: '2026-10-08' }),
        entry({ categoryId: 'groc', amount: 10_000, date: '2026-10-02' }),
      ]),
    );
    await goTab(page, 'Savings & Fun');
    await expect(page.getByTestId('spend-status-fun')).toHaveText('This week: $5 left of $25');
    await expect(page.getByTestId('spend-status-groc')).toHaveText('This month: $200 left of $300');

    // Next Sunday: a fresh $25 for the week, and the month keeps going.
    await page.clock.setFixedTime(NEXT_SUNDAY);
    await page.reload();
    await goTab(page, 'Savings & Fun');
    await expect(page.getByTestId('spend-status-fun')).toHaveText('This week: $25 left of $25');
    await expect(page.getByTestId('spend-status-groc')).toHaveText('This month: $200 left of $300');

    // November: a fresh month too.
    await page.clock.setFixedTime(NEXT_MONTH);
    await page.reload();
    await expect(page.getByTestId('home-spend-groc')).toContainText('$300 left this month');
    await expect(page.getByTestId('home-spend-fun')).toContainText('$25 left this week');
  });

  test('the details list this week, and a purchase can be logged, edited and deleted (with Undo)', async ({ page }) => {
    await openApp(page, spendBudget());
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: /^Fun Money/ }).click();
    const detail = sheet(page, 'spending-detail-sheet');
    await expect(detail.getByRole('heading', { name: 'Fun Money' })).toBeVisible();
    const status = detail.getByTestId('spend-detail-status');
    await expect(status).toHaveText('This week: $13 left of $25');
    await expect(detail).toContainText('$12 spent so far. A fresh $25 starts Sunday (Oct 11).');
    await expect(detail).toContainText("Spending inside this budget doesn't change your Left over.");
    const movies = detail.getByTestId('spend-entry-movies');
    await expect(movies).toHaveAccessibleName('Movies, $12, Sun, Oct 4. Edit');

    // Log one more from the details (it starts on this category).
    await detail.getByRole('button', { name: 'Log spending' }).click();
    const s = logSheet(page);
    await expect(s.getByRole('button', { name: 'Fun Money', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await s.getByLabel('How much did you spend?').fill('3');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expect(s).toBeHidden();
    await expect(status).toHaveText('This week: $10 left of $25');
    const rows = detail.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    // Newest first; no note reads "Purchase".
    await expect(rows.first().getByRole('button')).toHaveAccessibleName('Purchase, $3, Today. Edit');

    // Edit: amount and note.
    await movies.click();
    let e = sheet(page, 'spend-entry-sheet');
    await expect(e.getByRole('heading', { name: 'Edit purchase' })).toBeVisible();
    await expect(e.getByLabel('How much did you spend?')).toHaveValue('12');
    await expect(e.getByLabel('What was it for?')).toHaveValue('Movies');
    await expect(e.getByLabel('When?')).toHaveValue('2026-10-04');
    await e.getByLabel('How much did you spend?').fill('15');
    await e.getByLabel('What was it for?').fill('Movie night');
    await e.getByRole('button', { name: 'Save changes' }).click();
    await expect(e).toBeHidden();
    await expect(movies).toHaveAccessibleName('Movie night, $15, Sun, Oct 4. Edit');
    await expect(status).toHaveText('This week: $7 left of $25');
    expect((await stored(page)).spendLog.find((x) => x.id === 'movies')).toEqual(
      expect.objectContaining({ amount: 1_500, note: 'Movie night', date: '2026-10-04', categoryId: 'fun' }),
    );

    // Delete + Undo.
    await movies.click();
    e = sheet(page, 'spend-entry-sheet');
    await e.getByRole('button', { name: 'Delete this purchase' }).click();
    await expect(dialog(page)).toContainText('Movie night, $15 on Oct 4. You can undo this right after.');
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(e).toBeHidden();
    await expect(movies).toHaveCount(0);
    await expect(status).toHaveText('This week: $22 left of $25');
    await expect(toastText(page)).toContainText('Deleted “Movie night” ($15)');
    await undoButton(page).click();
    await expect(movies).toBeVisible();
    await expect(status).toHaveText('This week: $7 left of $25');
    expect((await stored(page)).spendLog.map((x) => x.id)).toContain('movies');

    // Moving a purchase to another category takes it off this list.
    await movies.click();
    e = sheet(page, 'spend-entry-sheet');
    await e.getByRole('button', { name: 'Groceries', exact: true }).click();
    await e.getByRole('button', { name: 'Save changes' }).click();
    await expect(e).toBeHidden();
    await expect(movies).toHaveCount(0);
    await detail.getByRole('button', { name: 'Close' }).click();
    await expect(detail).toBeHidden();
    await expect(page.getByTestId('spend-status-groc')).toHaveText('This month: $285 left of $300');
  });

  test('switching a category to Week shows the weekly amount and saves the right monthly amount', async ({ page }) => {
    const data = spendBudget([]);
    // A weekly amount the Smart Plan could have set (not an exact weekly amount): saving untouched keeps it as is.
    data.spending.push(spending({ id: 'eat', name: 'Eating Out', emoji: '🍔', monthly: 10_000, kind: 'fun', period: 'week' }));
    await openApp(page, data);
    await goTab(page, 'Savings & Fun');

    await page.getByRole('button', { name: /^Groceries/ }).click();
    await sheet(page, 'spending-detail-sheet').getByRole('button', { name: 'Edit Groceries' }).click();
    let s = sheet(page, 'spending-sheet');
    await expect(s.getByRole('radio', { name: 'Month' })).toBeChecked();
    await expect(s.getByLabel('How much each month?')).toHaveValue('300');
    // Week keeps the same budget: $300 a month is $69.23 a week.
    await choose(s, 'Week');
    await expect(s.getByLabel('How much each month?')).toHaveCount(0);
    const weekly = s.getByLabel('How much each week?');
    await expect(weekly).toHaveValue('69.23');
    await expect(weekly).toHaveAccessibleDescription('Your budget counts this as $300 a month.');
    await weekly.fill('70');
    await expect(weekly).toHaveAccessibleDescription('Your budget counts this as $303.33 a month.');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    expect((await stored(page)).spending[0]).toEqual(expect.objectContaining({ monthly: 30_333, period: 'week' }));
    await expect(page.getByRole('button', { name: /^Groceries Must-have \$70 a week/ })).toBeVisible();
    await expect(page.getByTestId('spend-status-groc')).toHaveText('This week: $70 left of $70');

    // Back to Month: the same budget again.
    await page.getByRole('button', { name: /^Groceries/ }).click();
    await sheet(page, 'spending-detail-sheet').getByRole('button', { name: 'Edit Groceries' }).click();
    s = sheet(page, 'spending-sheet');
    await expect(s.getByRole('radio', { name: 'Week' })).toBeChecked();
    await expect(s.getByLabel('How much each week?')).toHaveValue('70');
    await choose(s, 'Month');
    await expect(s.getByLabel('How much each month?')).toHaveValue('303.33');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    expect((await stored(page)).spending[0]).toEqual(expect.objectContaining({ monthly: 30_333, period: 'month' }));

    // Saving a weekly category without touching the amount keeps its monthly amount exactly.
    await page.getByRole('button', { name: /^Eating Out/ }).click();
    await sheet(page, 'spending-detail-sheet').getByRole('button', { name: 'Edit Eating Out' }).click();
    s = sheet(page, 'spending-sheet');
    await expect(s.getByLabel('How much each week?')).toHaveValue('23.08');
    await s.getByLabel('Name').fill('Eating Out Fund');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    expect((await stored(page)).spending[2]).toEqual(
      expect.objectContaining({ name: 'Eating Out Fund', monthly: 10_000, period: 'week' }),
    );

    // Home plans with the monthly amounts (shown in whole dollars).
    await goTab(page, 'Home');
    const planned = await centsOf(page.getByTestId('breakdown-spending'));
    expect(Math.abs(planned - (30_333 + 10_833 + 10_000))).toBeLessThan(100);
  });

  test('the log sheet checks the amount and the date', async ({ page }) => {
    await openApp(page, spendBudget());
    await page.getByTestId('home-spending').getByRole('button', { name: 'Log spending' }).click();
    const s = logSheet(page);
    const amount = s.getByLabel('How much did you spend?');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expectFieldError(amount, 'Please enter an amount');
    await amount.fill('0');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expectFieldError(amount, "Amount can't be zero");
    await amount.fill('5');
    await s.getByLabel('When?').fill('2026-10-09');
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expectFieldError(s.getByLabel('When?'), 'Please pick today or an earlier day.');
    await expect(s).toBeVisible();

    // A day from last week is fine, but it doesn't come out of this week's money.
    await s.getByLabel('When?').fill('2026-10-02');
    await expect(s.getByLabel('When?')).toHaveAccessibleDescription(
      "That's before this week, so it doesn't change what's left this week.",
    );
    await s.getByRole('button', { name: 'Log spending' }).click();
    await expect(s).toBeHidden();
    await expect(toastText(page)).toContainText('Logged $5 for Fun Money on Oct 2');
    await expect(page.getByTestId('home-spend-fun')).toContainText('$13 left this week');
    expect((await stored(page)).spendLog.at(-1)).toEqual(expect.objectContaining({ amount: 500, date: '2026-10-02' }));
  });

  test('without spending categories, Home waits for the bills, then leads to adding one first', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()] }));
    // "Next: add your bills" is the one next step until there are bills.
    await expect(page.getByRole('heading', { name: 'Next: add your bills' })).toBeVisible();
    await expect(page.getByTestId('home-spending')).toHaveCount(0);
  });

  test('without spending categories, Home leads to adding one first', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()], bills: [bill()] }));
    const card = page.getByTestId('home-spending');
    await expect(card).toContainText('Add a spending category first, like Fun Money.');
    await card.getByRole('button', { name: 'Add spending money' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Savings & Fun' })).toBeVisible();
    await expect(sheet(page, 'spending-sheet')).toBeVisible();
  });
});

test.describe('Spending log: layout', () => {
  test('no sideways scrolling: Home, Savings & Fun, the details and the log sheet', async ({ page }) => {
    const data = makeExampleBudget(TODAY);
    data.spending.push(
      spending({ id: 'long', name: 'Incomprehensibilities Weekend Money', monthly: 999_999_999, kind: 'fun', period: 'week' }),
    );
    data.spendLog.push(
      entry({ categoryId: 'long', amount: 999_999_999, note: 'Supercalifragilisticexpialidocious fun' }),
      entry({ categoryId: data.spending[3].id, amount: 9_999, note: 'Over budget dinner' }),
    );
    await openApp(page, data);
    await expect(page.getByTestId('home-spending')).toBeVisible();
    await expectNoHorizontalScroll(page, 'Home');
    await goTab(page, 'Savings & Fun');
    await expectNoHorizontalScroll(page, 'Savings & Fun');
    await page.getByRole('button', { name: /^Incomprehensibilities/ }).click();
    await expect(sheet(page, 'spending-detail-sheet')).toBeVisible();
    await expectNoHorizontalScroll(page, 'Spending details');
    await sheet(page, 'spending-detail-sheet').getByRole('button', { name: 'Log spending' }).click();
    await logSheet(page).getByLabel('How much did you spend?').fill('9999999.99');
    await expectNoHorizontalScroll(page, 'Log spending sheet');
  });
});
