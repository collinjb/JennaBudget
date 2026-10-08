import {
  budget,
  dialog,
  expect,
  expectCents,
  goTab,
  income,
  openApp,
  sheet,
  stored,
  test,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Money In', () => {
  test('add, edit, delete and undo a paycheck; total updates live', async ({ page }) => {
    await openApp(page, budget());
    await goTab(page, 'Money In');

    // Add from the empty state.
    await page.getByRole('button', { name: 'Add your paycheck' }).click();
    let s = sheet(page, 'income-sheet');
    await expect(s.getByRole('heading', { name: 'Add a paycheck' })).toBeVisible();
    await s.getByLabel('Name').fill('Main job');
    await s.getByLabel('Take-home amount').fill('2000');
    await s.getByLabel('How often?').selectOption('monthly');
    await s.getByLabel('Next payday').fill('2026-10-15');
    await s.getByRole('button', { name: 'Add paycheck' }).click();
    await expect(s).toBeHidden();
    const total = page.getByTestId('income-total');
    await expectCents(total, 200_000);
    await expect(total).toHaveText('$2,000');
    const mainRow = page.getByRole('button', { name: /^Main job/ });
    await expect(mainRow).toContainText('$2,000 every month');
    await expect(mainRow).toContainText('Next payday: Thu, Oct 15');

    // Edit.
    await mainRow.click();
    s = sheet(page, 'income-sheet');
    await expect(s.getByRole('heading', { name: 'Edit paycheck' })).toBeVisible();
    await expect(s.getByLabel('Take-home amount')).toHaveValue('2000');
    await s.getByLabel('Take-home amount').fill('2500');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expectCents(total, 250_000);

    // A second, every-2-weeks paycheck: $500 × 26 ÷ 12 = $1,083.33 a month, shown with "≈".
    await page.getByRole('button', { name: 'Add income' }).click();
    s = sheet(page, 'income-sheet');
    await s.getByLabel('Name').fill('Side gig');
    await s.getByLabel('Take-home amount').fill('500');
    await s.getByLabel('How often?').selectOption('biweekly');
    await s.getByLabel('Next payday').fill('2026-10-09');
    await s.getByRole('button', { name: 'Add paycheck' }).click();
    await expect(s).toBeHidden();
    await expectCents(total, 358_333);
    await expect(total).toHaveText('≈ $3,583.33');
    await expect(page.getByText(/Heads up: Side gig pays 3 times in January!/)).toBeVisible();

    // Delete with confirmation, then Undo puts it back in the same place.
    await mainRow.click();
    await sheet(page, 'income-sheet').getByRole('button', { name: 'Delete this paycheck' }).click();
    await expect(dialog(page)).toContainText('Delete “Main job”?');
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('status')).toContainText('Deleted “Main job”');
    await expect(mainRow).toHaveCount(0);
    await expectCents(total, 108_333);
    await undoButton(page).click();
    await expect(mainRow).toBeVisible();
    await expectCents(total, 358_333);
    expect((await stored(page)).incomes.map((i) => i.name)).toEqual(['Main job', 'Side gig']);
  });

  test('cancelling a delete keeps the paycheck', async ({ page }) => {
    await openApp(page, budget({ incomes: [income({ name: 'Main job' })] }));
    await goTab(page, 'Money In');
    await page.getByRole('button', { name: /^Main job/ }).click();
    await sheet(page, 'income-sheet').getByRole('button', { name: 'Delete this paycheck' }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(sheet(page, 'income-sheet')).toBeVisible();
    await sheet(page, 'income-sheet').getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet(page, 'income-sheet')).toBeHidden();
    await expectCents(page.getByTestId('income-total'), 200_000);
  });

  test('twice-a-month and weekly conversions', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [
          income({ name: 'Semi', amount: 100_000, frequency: 'semimonthly', semimonthlyDays: [1, 15] }),
          income({ name: 'Weekly', amount: 30_000, frequency: 'weekly', payDate: '2026-10-09' }),
        ],
      }),
    );
    await goTab(page, 'Money In');
    // $1,000 × 2 + $300 × 52 ÷ 12 ($1,300) = $3,300
    await expectCents(page.getByTestId('income-total'), 330_000);
    await expect(page.getByRole('button', { name: /^Semi/ })).toContainText('$1,000 twice a month');
    await page.getByText('How we calculate this').click();
    await expect(page.getByText('× 26 ÷ 12')).toBeVisible();
  });
});
