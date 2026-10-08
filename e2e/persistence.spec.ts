import { readFile } from 'node:fs/promises';
import { budget, choose, expect, expectCents, goTab, NOW, openApp, seed, sheet, standardBudget, stored, test } from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Data persistence', () => {
  test('everything entered survives a reload', async ({ page }) => {
    await openApp(page, budget());

    await goTab(page, 'Money In');
    await page.getByRole('button', { name: 'Add your paycheck' }).click();
    let s = sheet(page, 'income-sheet');
    await s.getByLabel('Take-home amount').fill('3000');
    await s.getByLabel('How often?').selectOption('monthly');
    await s.getByRole('button', { name: 'Add paycheck' }).click();
    await expect(s).toBeHidden();

    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add your first bill' }).click();
    s = sheet(page, 'bill-sheet');
    await s.getByRole('button', { name: 'Rent', exact: true }).click();
    await s.getByLabel('Amount').fill('1000');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s).toBeHidden();
    await page.getByRole('checkbox', { name: 'Rent paid' }).check();

    await goTab(page, 'Debt');
    await page.getByRole('button', { name: 'Add a debt' }).click();
    s = sheet(page, 'debt-sheet');
    await s.getByLabel('Name').fill('Visa');
    await s.getByLabel('How much do you owe now?').fill('1500');
    await s.getByLabel('Interest rate').fill('19.99');
    await s.getByLabel('Minimum monthly payment').fill('50');
    await s.getByRole('button', { name: 'Add debt' }).click();
    await expect(s).toBeHidden();

    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: 'Add spending money' }).click();
    s = sheet(page, 'spending-sheet');
    await s.getByLabel('Name').fill('Coffee');
    await s.getByLabel('How much each month?').fill('40');
    await choose(s, 'Nice-to-have');
    await s.getByRole('button', { name: 'Add spending money' }).click();
    await expect(s).toBeHidden();
    await page.getByRole('button', { name: 'Add a savings goal' }).click();
    s = sheet(page, 'goal-sheet');
    await s.getByLabel('Name').fill('Laptop');
    await s.getByLabel('Goal amount').fill('1200');
    await s.getByLabel('Add each month').fill('100');
    await s.getByRole('button', { name: 'Add goal' }).click();
    await expect(s).toBeHidden();

    await goTab(page, 'Home');
    // $3,000 − $1,000 − $50 − $40 − $100 = $1,810
    await expect(page.getByTestId('left-over')).toHaveText('$1,810');
    const before = await stored(page);

    await page.reload();
    await expect(page.getByTestId('left-over')).toHaveText('$1,810');
    expect(await stored(page)).toEqual(before);
    await goTab(page, 'Bills');
    await expect(page.getByRole('checkbox', { name: 'Rent paid' })).toBeChecked();
    await goTab(page, 'Debt');
    await expectCents(page.getByTestId('debt-total'), 150_000);
    await goTab(page, 'Savings & Fun');
    await expect(page.getByRole('button', { name: /^Coffee Nice-to-have \$40/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Laptop' })).toBeVisible();
  });

  test('a reload while a page is open starts back on the tabs', async ({ page }) => {
    await openApp(page, budget());
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('unreadable saved data shows the recovery screen, never a blank page', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-08T15:00:00Z'));
    await seed(page, '{"schemaVersion":1,"incomes":[{"broken"');
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't open your budget" })).toBeVisible();
    await page.getByRole('button', { name: 'Start fresh' }).click();
    await page.getByRole('button', { name: 'Yes, erase and start fresh' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
  });

  test('saved data with a damaged field shows the recovery screen', async ({ page }) => {
    const bad = budget() as unknown as Record<string, unknown>;
    bad.bills = [{ id: 'x', name: 'Rent', emoji: '🏠', amount: -5, frequency: 'monthly', dueDay: 1, dueDate: '2026-10-01', paidMonth: null }];
    await page.clock.setFixedTime(new Date('2026-10-08T15:00:00Z'));
    await seed(page, JSON.stringify(bad));
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't open your budget" })).toBeVisible();
  });

  test('recovery screen: restore the last good copy', async ({ page }) => {
    const good = standardBudget();
    await page.clock.setFixedTime(NOW);
    await page.addInitScript(
      ([prev]) => {
        if (sessionStorage.getItem('e2e.seeded')) return;
        localStorage.setItem('budget.data', 'not json at all');
        localStorage.setItem('budget.data.previous', prev);
        sessionStorage.setItem('e2e.seeded', '1');
      },
      [JSON.stringify(good)] as const,
    );
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't open your budget" })).toBeVisible();

    // The unreadable text can be saved first, so nothing is lost.
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save the unreadable data' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^budget-unreadable-data-2026-10-08\.json$/);
    const path = test.info().outputPath('unreadable.json');
    await download.saveAs(path);
    expect(await readFile(path, 'utf8')).toBe('not json at all');

    await page.getByRole('button', { name: 'Restore the last good copy' }).click();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    expect(await stored(page)).toEqual(good);
    await page.reload();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
  });

  test('a save that fails (phone storage full) is reported, not silently lost', async ({ page }) => {
    await openApp(page, standardBudget());
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    await page.evaluate(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    });
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add a bill' }).click();
    const s = sheet(page, 'bill-sheet');
    await s.getByLabel('Name').fill('Water');
    await s.getByLabel('Amount').fill('40');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByRole('alert').filter({ hasText: "Your last change couldn't be saved on this phone." })).toContainText(
      'out of space',
    );
    // The app keeps working with the change on screen.
    await expectCents(page.getByTestId('bills-total'), 90_000);
  });
});
