import {
  budget,
  debt,
  expect,
  expectCents,
  expectFieldError,
  expectNoFieldError,
  goTab,
  income,
  openApp,
  sheet,
  standardBudget,
  stored,
  test,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Money input validation', () => {
  test('letters, negatives, 3 decimals and zero show an error; "$1,234.56" is accepted', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add a bill' }).click();
    const s = sheet(page, 'bill-sheet');
    const amount = s.getByLabel('Amount');
    const save = s.getByRole('button', { name: 'Save', exact: true });

    // iPhone number pad with a decimal point, never type="number".
    await expect(amount).toHaveAttribute('type', 'text');
    await expect(amount).toHaveAttribute('inputmode', 'decimal');

    await s.getByLabel('Name').fill('Water');
    await save.click();
    await expectFieldError(amount, 'Please enter an amount');

    const cases: [string, string][] = [
      ['abc', 'Please enter an amount like 25 or 25.50'],
      ['12abc', 'Please enter an amount like 25 or 25.50'],
      ['-5', "Amount can't be negative"],
      ['1.234', 'Please use at most 2 decimal places, like 25.50'],
      ['0', "Amount can't be zero"],
      ['$10,000,000', "That's more than this app can handle"],
    ];
    for (const [typed, message] of cases) {
      await amount.fill(typed);
      // Typing clears the old error right away.
      await expectNoFieldError(amount);
      await save.click();
      await expectFieldError(amount, message);
      await expect(s).toBeVisible();
    }
    expect((await stored(page)).bills).toHaveLength(2);

    // The error also shows when leaving the field (blur), before saving.
    await amount.fill('4x');
    await s.getByLabel('Name').focus();
    await expectFieldError(amount, 'Please enter an amount like 25 or 25.50');

    await amount.fill('$1,234.56');
    await expect(s.locator('.field__prefix')).toHaveCount(0); // no double "$"
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s).toBeHidden();
    await expectCents(page.getByTestId('bills-total'), 86_000 + 123_456);
    expect((await stored(page)).bills.at(-1)).toEqual(expect.objectContaining({ name: 'Water', amount: 123_456 }));
  });

  test('other accepted formats: "1234.5", " 12 ", ".5", "$9,999,999.99"', async ({ page }) => {
    await openApp(page, budget());
    await goTab(page, 'Money In');
    const cases: [string, number][] = [
      ['1234.5', 123_450],
      [' 12 ', 1_200],
      ['.5', 50],
      ['$9,999,999.99', 999_999_999],
    ];
    for (const [typed, cents] of cases) {
      await page.getByRole('button', { name: /^Add (your paycheck|income)$/ }).click();
      const s = sheet(page, 'income-sheet');
      await s.getByLabel('Take-home amount').fill(typed);
      await s.getByLabel('How often?').selectOption('monthly');
      await s.getByRole('button', { name: 'Add paycheck' }).click();
      await expect(s).toBeHidden();
      expect((await stored(page)).incomes.at(-1)?.amount, `"${typed}"`).toBe(cents);
    }
  });

  test('interest rate validation', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()], debts: [debt()] }));
    await goTab(page, 'Debt');
    await page.getByRole('button', { name: 'Edit Credit Card' }).click();
    const s = sheet(page, 'debt-sheet');
    const rate = s.getByLabel('Interest rate');
    const save = s.getByRole('button', { name: 'Save', exact: true });
    for (const [typed, message] of [
      ['abc', 'Please enter a rate like 6.8 or 24.99'],
      ['-3', "Interest rate can't be negative"],
      ['24.999', 'Please use at most 2 decimal places, like 24.99'],
      ['101', "Interest rate can't be more than 100%"],
    ] as const) {
      await rate.fill(typed);
      await save.click();
      await expectFieldError(rate, message);
    }
    await rate.fill('6.8%');
    await save.click();
    await expect(s).toBeHidden();
    expect((await stored(page)).debts[0].rateBps).toBe(680);
  });

  test('double-tapping Save adds the item only once', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add a bill' }).click();
    const s = sheet(page, 'bill-sheet');
    await s.getByLabel('Name').fill('Water');
    await s.getByLabel('Amount').fill('40');
    await s.getByRole('button', { name: 'Add bill' }).dblclick();
    await expect(s).toBeHidden();
    await expectCents(page.getByTestId('bills-total'), 90_000);
    expect((await stored(page)).bills.filter((b) => b.name === 'Water')).toHaveLength(1);
  });

  test('Escape / Cancel closes a sheet without saving', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add a bill' }).click();
    const s = sheet(page, 'bill-sheet');
    await s.getByLabel('Name').fill('Nope');
    await s.getByLabel('Amount').fill('10');
    await page.keyboard.press('Escape');
    await expect(s).toBeHidden();
    await expectCents(page.getByTestId('bills-total'), 86_000);
    expect((await stored(page)).bills).toHaveLength(2);
  });
});
