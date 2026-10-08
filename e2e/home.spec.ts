import {
  bill,
  budget,
  debt,
  expect,
  expectCents,
  expectHomeAddsUp,
  goal,
  goTab,
  income,
  openApp,
  sheet,
  spending,
  standardBudget,
  test,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Home', () => {
  test('shows Left Over and a breakdown that adds up to take-home pay', async ({ page }) => {
    await openApp(page, standardBudget());
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    const left = page.getByTestId('left-over');
    await expect(left).toHaveText('$540');
    // Changes to the big number are announced politely (it sits in an aria-live region).
    await expect(page.locator('[aria-live="polite"]').filter({ has: left })).toHaveCount(1);
    await expectCents(page.getByTestId('breakdown-bills'), 86_000);
    await expectCents(page.getByTestId('breakdown-debt'), 10_000);
    await expectCents(page.getByTestId('breakdown-savings'), 10_000);
    await expectCents(page.getByTestId('breakdown-spending'), 40_000);
    await expectCents(page.getByTestId('breakdown-leftOver'), 54_000);
    await expectCents(page.getByTestId('breakdown-income'), 200_000);
    await expectHomeAddsUp(page);
    // The other Home cards are there too.
    await expect(page.getByTestId('next-paycheck')).toContainText('Thu, Oct 15');
    await expect(page.getByTestId('debt-free-date')).toBeVisible();
    await expect(page.getByTestId('plan-card')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Trip progress' })).toBeVisible();
  });

  test('totals update live as items are added on other tabs', async ({ page }) => {
    await openApp(page, standardBudget());
    await expect(page.getByTestId('left-over')).toHaveText('$540');

    // A new $100 bill: Bills +$100, Left over −$100.
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add a bill' }).click();
    const s = sheet(page, 'bill-sheet');
    await s.getByLabel('Name').fill('Water');
    await s.getByLabel('Amount').fill('100');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s).toBeHidden();
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$440');
    await expectCents(page.getByTestId('breakdown-bills'), 96_000);
    await expectHomeAddsUp(page);

    // A raise on Money In: take-home +$500.
    await goTab(page, 'Money In');
    await page.getByRole('button', { name: /^Paycheck/ }).click();
    const inc = sheet(page, 'income-sheet');
    await inc.getByLabel('Take-home amount').fill('2500');
    await inc.getByRole('button', { name: 'Save changes' }).click();
    await expect(inc).toBeHidden();
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$940');
    await expectCents(page.getByTestId('breakdown-income'), 250_000);
    await expectHomeAddsUp(page);

    // More spending money: Spending +$60.
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: /^Groceries/ }).click();
    const sp = sheet(page, 'spending-sheet');
    await sp.getByLabel('How much each month?').fill('360');
    await sp.getByRole('button', { name: 'Save changes' }).click();
    await expect(sp).toBeHidden();
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$880');
    await expectCents(page.getByTestId('breakdown-spending'), 46_000);
    await expectHomeAddsUp(page);
  });

  test('over budget: red "over" amount and a link to the Smart Plan', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [income({ amount: 100_000 })],
        bills: [bill({ amount: 90_000 })],
        debts: [debt({ balance: 100_000, minPayment: 5_000, rateBps: 1200 })],
        spending: [spending({ monthly: 10_000 }), spending({ name: 'Fun Money', emoji: '🎉', monthly: 5_000, kind: 'fun' })],
      }),
    );
    // $1,000 in − ($900 + $50 + $150) out = $100 over.
    const left = page.getByTestId('left-over');
    await expect(left).toHaveText("You're $100 over");
    await expectCents(left, -10_000);
    await expect(page.locator('.hero')).toHaveClass(/hero--over/);
    // Red: the over amount uses the "over" ink color (not the normal left-over teal).
    const color = await page.locator('.hero__amount').evaluate((el) => getComputedStyle(el).color);
    const overToken = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--c-over-ink)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(color).toBe(overToken);
    await expect(page.getByText('Over budget')).toBeVisible();
    await expectCents(page.getByTestId('breakdown-leftOver'), -10_000);

    await page.getByRole('button', { name: "Here's how to fix it" }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Plan' })).toBeVisible();
  });

  test('empty budget nudges to add a paycheck, then bills', async ({ page }) => {
    await openApp(page, budget());
    await expect(page.getByTestId('left-over')).toHaveText('$0');
    await page.getByRole('button', { name: 'Add your paycheck' }).click();
    // Lands on Money In with the add sheet already open.
    const s = sheet(page, 'income-sheet');
    await expect(s).toBeVisible();
    await s.getByLabel('Take-home amount').fill('1000');
    await s.getByRole('button', { name: 'Add paycheck' }).click();
    await expect(s).toBeHidden();
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText(/\$2,167/);
    await expect(page.getByRole('heading', { name: 'Next: add your bills' })).toBeVisible();
    await page.getByRole('button', { name: 'Add your bills' }).click();
    await expect(sheet(page, 'bill-sheet')).toBeVisible();
  });

  test('goal progress card and Settings gear', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()], goals: [goal({ saved: 25_000, target: 100_000 })] }));
    const bar = page.getByRole('progressbar', { name: 'Trip progress' });
    await expect(bar).toHaveAttribute('aria-valuenow', '25');
    await expect(page.getByText("At $100/month you'll reach this by June 2027")).toBeVisible();
    await page.getByRole('button', { name: 'See all savings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Savings & Fun' })).toBeVisible();
    await goTab(page, 'Home');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
  });
});
