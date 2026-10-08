import type { Page } from '@playwright/test';
import {
  budget,
  choose,
  debt,
  dialog,
  expect,
  expectCents,
  goTab,
  income,
  openApp,
  sheet,
  standardBudget,
  stored,
  test,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

const debtCard = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });

const slider = (page: Page) => page.getByLabel(/What if I paid/);
const extraResult = (page: Page) => page.locator('.extra-card__result');

test.describe('Debt', () => {
  test('add (quick-pick chip), edit, delete and undo a debt', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()] }));
    await goTab(page, 'Debt');
    await page.getByRole('button', { name: 'Add a debt' }).click();
    let s = sheet(page, 'debt-sheet');
    await s.getByRole('button', { name: 'Car Loan', exact: true }).click();
    await expect(s.getByLabel('Name')).toHaveValue('Car Loan');
    await expect(s.getByLabel('What kind?')).toHaveValue('car');
    await s.getByLabel('How much do you owe now?').fill('8,000');
    await s.getByLabel('Interest rate').fill('5.9');
    await s.getByLabel('Minimum monthly payment').fill('245');
    await s.getByLabel('Payment due on').selectOption('5');
    await s.getByRole('button', { name: 'Add debt' }).click();
    await expect(s).toBeHidden();
    await expectCents(page.getByTestId('debt-total'), 800_000);
    const car = debtCard(page, 'Car Loan');
    await expect(car).toContainText('$8,000');
    await expect(car).toContainText('5.9% interest · $245 minimum · due the 5th');
    await expect(page.getByTestId('debt-free-date')).toHaveText(/20\d\d/);

    // Edit.
    await page.getByRole('button', { name: 'Edit Car Loan' }).click();
    s = sheet(page, 'debt-sheet');
    await expect(s.getByRole('heading', { name: 'Edit debt' })).toBeVisible();
    await expect(s.getByLabel('Interest rate')).toHaveValue('5.9');
    await s.getByLabel('Minimum monthly payment').fill('300');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expect(car).toContainText('$300 minimum');
    await goTab(page, 'Home');
    await expectCents(page.getByTestId('breakdown-debt'), 30_000);

    // Delete + Undo.
    await goTab(page, 'Debt');
    await page.getByRole('button', { name: 'Edit Car Loan' }).click();
    await sheet(page, 'debt-sheet').getByRole('button', { name: 'Delete this debt' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No debt? Wonderful!')).toBeVisible();
    await undoButton(page).click();
    await expect(car).toBeVisible();
    expect((await stored(page)).debts).toEqual([
      expect.objectContaining({ name: 'Car Loan', type: 'car', balance: 800_000, rateBps: 590, minPayment: 30_000, dueDay: 5 }),
    ]);
  });

  test('payoff date: a 0% $1,200 debt at $100/month is paid off in October 2027', async ({ page }) => {
    await openApp(
      page,
      budget({ incomes: [income()], debts: [debt({ name: 'Phone plan', type: 'other', balance: 120_000, rateBps: 0, minPayment: 10_000 })] }),
    );
    await expect(page.getByTestId('debt-free-date')).toHaveText('October 2027');
    await expect(page.locator('.debtfree-card')).toContainText("At this pace you'll be debt-free in October 2027 (1 yr).");
    await page.getByRole('button', { name: 'See your debt plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Debt' })).toBeVisible();
    await expect(page.getByTestId('debt-free-date')).toHaveText('October 2027');
    await expect(page.getByText("That's 1 yr from now, at this pace.")).toBeVisible();
    await expect(page.getByText('Paid off Oct 2027')).toBeVisible();
    await expect(page.getByRole('img', { name: /down to \$0 in October 2027/ })).toBeVisible();
  });

  test('extra slider shows "sooner / save" and "Add $X extra to my budget" applies it (with Undo)', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Debt');
    const before = (await page.getByTestId('debt-free-date').textContent()) ?? '';
    await expect(extraResult(page)).toHaveText('Slide to see how paying extra changes your debt-free date.');

    await slider(page).fill('200');
    await expect(page.getByText('What if I paid $200 extra each month?')).toBeVisible();
    await expect(extraResult(page)).toHaveText(/^You'd be debt-free \d+ months sooner and save \$[\d,]+(\.\d\d)? in interest\.$/);

    await page.getByRole('button', { name: 'Add $200 extra to my budget' }).click();
    await expect(page.getByRole('status')).toContainText('Paying $200 extra each month');
    await expect(page.getByText('Your budget pays $200 extra now.')).toBeVisible();
    await expect(page.getByTestId('debt-free-date')).not.toHaveText(before);
    expect((await stored(page)).settings.extraDebtPayment).toBe(20_000);
    await goTab(page, 'Home');
    await expectCents(page.getByTestId('breakdown-debt'), 30_000);
    await expect(page.getByTestId('left-over')).toHaveText('$340');

    // Sliding back down explains the cost, and Undo restores the old extra.
    await goTab(page, 'Debt');
    await slider(page).fill('50');
    await expect(extraResult(page)).toHaveText(/^You'd be debt-free \d+ months? later and pay \$[\d,.]+ more in interest\.$/);
    await slider(page).fill('200');
    await expect(page.getByRole('button', { name: /extra to my budget/ })).toHaveCount(0);
  });

  test('Undo on the extra-payment toast restores the previous amount', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Debt');
    await slider(page).fill('100');
    await page.getByRole('button', { name: 'Add $100 extra to my budget' }).click();
    await expect(page.getByText('Your budget pays $100 extra now.')).toBeVisible();
    await undoButton(page).click();
    await expect(page.getByText('Extra payments come out of your Left Over money.')).toBeVisible();
    expect((await stored(page)).settings.extraDebtPayment).toBe(0);
  });

  test('sliding to $0 offers "Stop paying extra"', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()], debts: [debt()] }, { extraDebtPayment: 15_000 }));
    await goTab(page, 'Debt');
    await expect(page.getByText('What if I paid $150 extra each month?')).toBeVisible();
    await slider(page).fill('0');
    await expect(extraResult(page)).toContainText('later');
    await page.getByRole('button', { name: 'Stop paying extra' }).click();
    await expect(page.getByRole('status')).toContainText('Extra payment removed');
    expect((await stored(page)).settings.extraDebtPayment).toBe(0);
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$1,900');
  });

  test('payoff method toggle changes the payoff order', async ({ page }) => {
    await openApp(
      page,
      budget(
        {
          incomes: [income({ amount: 400_000 })],
          debts: [
            debt({ name: 'Big Card', balance: 200_000, rateBps: 2000, minPayment: 5_000 }),
            debt({ name: 'Small Loan', type: 'personal', balance: 100_000, rateBps: 200, minPayment: 5_000 }),
          ],
        },
        { extraDebtPayment: 20_000 },
      ),
    );
    await goTab(page, 'Debt');
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Which debt first?' }) });
    const order = card.getByRole('listitem');
    await expect(card.getByRole('radio', { name: 'Save the most money' })).toBeChecked();
    await expect(card.getByText('Pays off the highest interest rate first.', { exact: false })).toBeVisible();
    await expect(order.nth(0)).toContainText('Big Card');
    await expect(order.nth(1)).toContainText('Small Loan');

    await choose(card, 'Quick wins');
    await expect(card.getByText('Pays off the smallest balance first.', { exact: false })).toBeVisible();
    await expect(order.nth(0)).toContainText('Small Loan');
    await expect(order.nth(1)).toContainText('Big Card');
    expect((await stored(page)).settings.payoffMethod).toBe('snowball');

    // Settings shows the same choice.
    await goTab(page, 'Home');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Quick wins' })).toBeChecked();
  });

  test('never-payoff warning when the minimum does not cover the interest', async ({ page }) => {
    await openApp(
      page,
      budget({ incomes: [income({ amount: 400_000 })], debts: [debt({ balance: 1_000_000, rateBps: 2400, minPayment: 10_000 })] }),
    );
    const warning =
      "Credit Card: Your $100 payment doesn't cover the $200 of interest each month, so this balance will keep growing.";
    await expect(page.getByTestId('debt-free-date')).toHaveText("At this pace your debt won't be paid off");
    await expect(page.getByText(warning)).toBeVisible();
    await goTab(page, 'Debt');
    await expect(page.getByTestId('debt-free-date')).toHaveText('More than 50 years');
    await expect(page.getByRole('note').filter({ hasText: warning })).toBeVisible();
    await expect(page.getByText('Not in 50 years')).toBeVisible();
    // Enough extra makes it payable.
    await slider(page).fill('300');
    await expect(extraResult(page)).toHaveText(/^You'd be debt-free by \w+ \d{4} instead of never\.$/);
  });

  test('"Update balance" changes the balance; paying it off celebrates', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Debt');
    await expectCents(page.getByTestId('debt-total'), 300_000);
    await page.getByRole('button', { name: 'Update balance for Credit Card' }).click();
    let s = sheet(page, 'balance-sheet');
    await expect(s.getByLabel('Current balance')).toHaveValue('3000');
    await s.getByLabel('Current balance').fill('2,500.75');
    await s.getByRole('button', { name: 'Update balance', exact: true }).click();
    await expect(s).toBeHidden();
    await expectCents(page.getByTestId('debt-total'), 250_075);
    await expect(debtCard(page, 'Credit Card')).toContainText('$2,500.75');

    await page.getByRole('button', { name: 'Update balance for Credit Card' }).click();
    s = sheet(page, 'balance-sheet');
    await s.getByLabel('Current balance').fill('0');
    await s.getByRole('button', { name: 'Update balance', exact: true }).click();
    const party = page.getByRole('dialog', { name: 'Paid off!' });
    await expect(party).toContainText('You paid off Credit Card. 🎉');
    await party.getByRole('button', { name: 'Done' }).click();
    await expect(party).toBeHidden();
    await expect(page.getByTestId('debt-free-date')).toHaveText("You're debt-free! 🎉");
    await expect(debtCard(page, 'Credit Card')).toContainText('Paid off 🎉');
    // A paid-off debt no longer takes a minimum payment.
    await goTab(page, 'Home');
    await expectCents(page.getByTestId('breakdown-debt'), 0);
    await expect(page.getByTestId('left-over')).toHaveText('$640');
  });
});
