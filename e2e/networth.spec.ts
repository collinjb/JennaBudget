import { makeExampleBudget } from '../src/lib/exampleData';
import type { Account, CreditScore } from '../src/types';
import type { Page } from '@playwright/test';
import {
  budget,
  choose,
  debt,
  dialog,
  expect,
  expectCents,
  expectFieldError,
  expectNoHorizontalScroll,
  goTab,
  income,
  openApp,
  sheet,
  stored,
  test,
  TODAY,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

function account(over: Partial<Account> = {}): Account {
  return { id: 'acc-1', name: 'Savings', type: 'savings', balance: 200_000, updatedAt: TODAY, ...over };
}

function score(over: Partial<CreditScore> = {}): CreditScore {
  return { id: 'cs-1', score: 700, date: '2026-09-01', ...over };
}

/** Home's Net worth card → the Net worth page. */
async function openNetWorth(page: Page, button: 'See net worth' | 'Track your net worth' = 'See net worth') {
  await page.getByTestId('home-networth').getByRole('button', { name: button }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Net worth' })).toBeVisible();
}

async function back(page: Page) {
  await page.getByRole('button', { name: 'Back', exact: true }).click();
}

const accountRows = (page: Page) => page.locator('[data-testid^="account-row-"]');

test.describe('Net worth', () => {
  test('open from Home, add Savings, a Roth IRA and SERS: totals and net worth follow the Debt tab', async ({ page }) => {
    // One $3,000 credit card on the Debt tab.
    await openApp(page, budget({ incomes: [income()], debts: [debt()] }));
    await expect(page.getByTestId('home-networth')).toContainText('Track your net worth and credit score');
    await openNetWorth(page, 'Track your net worth');

    // No accounts yet: no net worth number, just what you owe and an invite.
    await expect(page.getByTestId('networth-total')).toHaveCount(0);
    await expect(page.getByText('Add your accounts below to see your net worth.')).toBeVisible();
    await expectCents(page.getByTestId('networth-owe'), 300_000);
    await expect(page.getByText('Your debts come from the Debt tab.')).toBeVisible();

    // A savings account (the default kind).
    await page.getByRole('button', { name: 'Add an account' }).click();
    let s = sheet(page, 'account-sheet');
    await expect(s.getByRole('heading', { name: 'Add an account' })).toBeVisible();
    await expect(s.getByRole('radio', { name: /^Savings account/ })).toBeChecked();
    // Saving without a balance asks for one.
    await s.getByRole('button', { name: 'Add account' }).click();
    await expectFieldError(s.getByLabel('How much is in it now?'), 'Please enter an amount');
    await s.getByLabel('How much is in it now?').fill('2150.50');
    await s.getByRole('button', { name: 'Add account' }).click();
    await expect(s).toBeHidden();

    // $2,150.50 − $3,000 = −$849.50: red, with a real minus sign.
    const total = page.getByTestId('networth-total');
    await expectCents(total, -84_950);
    await expect(total).toHaveText(/^−⁠?\$849\.50$/);
    await expect(total).toHaveClass(/tone-over/);
    await expect(page.getByText('You owe more than you have right now.', { exact: false })).toBeVisible();

    // A Roth IRA: the name defaults to the kind.
    await page.getByRole('button', { name: 'Add an account' }).click();
    s = sheet(page, 'account-sheet');
    await choose(s, /^Roth IRA/);
    await s.getByLabel('How much is in it now?').fill('6,400');
    await s.getByRole('button', { name: 'Add account' }).click();
    await expect(s).toBeHidden();

    // SERS, as a retirement account.
    await page.getByRole('button', { name: 'Add an account' }).click();
    s = sheet(page, 'account-sheet');
    await choose(s, /^Retirement or pension \(like SERS/);
    await expect(s.getByLabel('Name')).toHaveAttribute('placeholder', 'Like SERS');
    await s.getByLabel('Name').fill('SERS');
    await s.getByLabel('How much is in it now?').fill('11800');
    await s.getByRole('button', { name: 'Add account' }).click();
    await expect(s).toBeHidden();

    // $2,150.50 + $6,400 + $11,800 = $20,350.50 have; − $3,000 owed = $17,350.50.
    await expect(accountRows(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: /^Roth IRA, \$6,400, updated today\. Edit$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^SERS, Retirement, \$11,800, updated today\. Edit$/ })).toBeVisible();
    await expectCents(page.getByTestId('networth-have'), 2_035_050);
    await expectCents(page.getByTestId('networth-owe'), 300_000);
    await expectCents(total, 1_735_050);
    await expect(total).toHaveText('$17,350.50');
    await expect(total).toHaveClass(/tone-left/);
    const byType = page.getByTestId('networth-by-type');
    await expect(byType).toContainText('Savings $2,150.50');
    await expect(byType).toContainText('Roth IRA $6,400');
    await expect(byType).toContainText('Retirement $11,800');

    const d = await stored(page);
    expect(d.accounts.map((a) => [a.name, a.type, a.balance, a.updatedAt])).toEqual([
      ['Savings', 'savings', 215_050, TODAY],
      ['Roth IRA', 'roth', 640_000, TODAY],
      ['SERS', 'retirement', 1_180_000, TODAY],
    ]);

    // Pay down the debt on the Debt tab: what you owe and the net worth follow.
    await page.getByRole('button', { name: 'See your debts' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Debt' })).toBeVisible();
    await page.getByRole('button', { name: 'Update balance for Credit Card' }).click();
    const bal = sheet(page, 'balance-sheet');
    await bal.getByLabel('Current balance').fill('1000');
    await bal.getByRole('button', { name: 'Update balance' }).click();
    await expect(bal).toBeHidden();
    await goTab(page, 'Home');
    await expectCents(page.getByTestId('home-networth-total'), 1_935_050);
    await openNetWorth(page);
    await expectCents(page.getByTestId('networth-owe'), 100_000);
    await expectCents(page.getByTestId('networth-total'), 1_935_050);
  });

  test('update a balance, edit an account, and delete it with Undo', async ({ page }) => {
    await openApp(
      page,
      budget({
        accounts: [
          account({ id: 'acc-sav', updatedAt: '2026-07-01' }),
          account({ id: 'acc-roth', name: 'Roth IRA', type: 'roth', balance: 640_000, updatedAt: '2026-09-28' }),
        ],
      }),
    );
    await openNetWorth(page);
    await expectCents(page.getByTestId('networth-total'), 840_000);

    // An old balance gets a gentle hint.
    const savings = page.getByTestId('account-row-acc-sav');
    await expect(savings).toContainText('Updated Jul 1');
    await expect(savings).toContainText('Time to update?');
    await expect(page.getByTestId('account-row-acc-roth')).toContainText('Updated Sep 28');
    await expect(page.getByTestId('account-row-acc-roth')).not.toContainText('Time to update?');

    // "Update" changes just the balance and marks it updated today.
    await page.getByRole('button', { name: 'Update balance for Savings' }).click();
    const bal = sheet(page, 'account-balance-sheet');
    await expect(bal.getByLabel('Balance now')).toHaveValue('2000');
    await bal.getByLabel('Balance now').fill('3000');
    await bal.getByRole('button', { name: 'Update balance' }).click();
    await expect(bal).toBeHidden();
    await expect(savings).toContainText('Updated today');
    await expect(savings).not.toContainText('Time to update?');
    await expect(savings).toContainText('$3,000');
    await expectCents(page.getByTestId('networth-total'), 940_000);
    expect((await stored(page)).accounts[0]).toEqual(account({ id: 'acc-sav', balance: 300_000, updatedAt: TODAY }));

    // Tap the row to edit everything.
    await page.getByRole('button', { name: /^Roth IRA, \$6,400, updated Sep 28\. Edit$/ }).click();
    let s = sheet(page, 'account-sheet');
    await expect(s.getByRole('heading', { name: 'Edit account' })).toBeVisible();
    await expect(s.getByLabel('What kind of account?')).toHaveValue('roth');
    await s.getByLabel('Name').fill('Fidelity Roth');
    await s.getByLabel('How much is in it now?').fill('7000');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    const roth = page.getByTestId('account-row-acc-roth');
    await expect(roth).toContainText('Fidelity Roth');
    // The kind shows under a name that doesn't say it.
    await expect(roth).toContainText('Roth IRA');
    await expect(roth).toContainText('Updated today');
    await expectCents(page.getByTestId('networth-have'), 1_000_000);

    // Delete (asks first), then Undo puts it back in its place.
    await page.getByRole('button', { name: /^Fidelity Roth,/ }).click();
    s = sheet(page, 'account-sheet');
    await s.getByRole('button', { name: 'Delete this account' }).click();
    await expect(dialog(page)).toContainText('Delete “Fidelity Roth”?');
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(s).toBeHidden();
    await expect(roth).toHaveCount(0);
    await expectCents(page.getByTestId('networth-have'), 300_000);
    expect((await stored(page)).accounts).toHaveLength(1);

    await undoButton(page).click();
    await expect(roth).toBeVisible();
    await expect(accountRows(page).nth(1)).toHaveAttribute('data-testid', 'account-row-acc-roth');
    await expectCents(page.getByTestId('networth-have'), 1_000_000);
    expect((await stored(page)).accounts.map((a) => a.id)).toEqual(['acc-sav', 'acc-roth']);
  });

  test('credit scores: checks the number, shows the latest, its band and the change; delete with Undo', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()] }));
    await openNetWorth(page, 'Track your net worth');
    await expect(page.getByText('Add your credit score to keep an eye on it.')).toBeVisible();
    await expect(page.getByText('You can find it free in your bank or credit card app.')).toBeVisible();

    await page.getByRole('button', { name: 'Add your credit score' }).click();
    let s = sheet(page, 'credit-score-sheet');
    await expect(s.getByRole('heading', { name: 'Add your credit score' })).toBeVisible();
    const field = s.getByLabel('Your credit score');
    // Numeric keypad on the iPhone.
    await expect(field).toHaveAttribute('inputmode', 'numeric');

    // Out of range, letters and empty are refused with a plain-English error.
    await field.fill('900');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expectFieldError(field, 'Credit scores go from 300 to 850');
    await field.fill('abc');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expectFieldError(field, 'Please enter a whole number, like 712');
    await field.fill('');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expectFieldError(field, 'Please enter your score, like 712');
    // A check can't be in the future.
    await field.fill('690');
    await expect(s.getByText("That's good (670 to 739).")).toBeVisible();
    await s.getByLabel('When did you check it?').fill('2026-12-01');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expectFieldError(s.getByLabel('When did you check it?'), 'Please pick today or an earlier day.');
    expect((await stored(page)).creditScores).toEqual([]);

    await s.getByLabel('When did you check it?').fill('2026-06-03');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByTestId('credit-score-latest')).toHaveText('690');
    await expect(page.getByTestId('credit-score-band')).toHaveText('Good');
    // Only one check: nothing to compare with yet.
    await expect(page.getByTestId('credit-score-change')).toHaveCount(0);

    // Two more checks.
    for (const [value, date] of [
      ['702', '2026-08-03'],
      ['655', TODAY],
    ]) {
      await page.getByRole('button', { name: 'Update credit score' }).click();
      s = sheet(page, 'credit-score-sheet');
      await expect(s.getByLabel('When did you check it?')).toHaveValue(TODAY);
      await s.getByLabel('Your credit score').fill(value);
      await s.getByLabel('When did you check it?').fill(date);
      await s.getByRole('button', { name: 'Save score' }).click();
      await expect(s).toBeHidden();
    }
    await expect(page.getByTestId('credit-score-latest')).toHaveText('655');
    await expect(page.getByTestId('credit-score-band')).toHaveText('Fair');
    const change = page.getByTestId('credit-score-change');
    await expect(change).toHaveText('▼ Down 47 points since Aug 3');
    await expect(page.getByRole('img', { name: 'Your credit score went from 690 on Jun 3 to 655 on Oct 8.' })).toBeVisible();
    // History, newest first.
    const history = page.getByRole('button', { name: /, checked .+\. Edit$/ });
    await expect(history).toHaveCount(3);
    await expect(history.nth(0)).toHaveAccessibleName('655, Fair, checked Oct 8. Edit');
    await expect(history.nth(1)).toHaveAccessibleName('702, Good, checked Aug 3. Edit');
    await expect(history.nth(2)).toHaveAccessibleName('690, Good, checked Jun 3. Edit');

    // Fix a typo in an older check.
    await history.nth(1).click();
    s = sheet(page, 'credit-score-sheet');
    await expect(s.getByRole('heading', { name: 'Edit credit score' })).toBeVisible();
    await expect(s.getByLabel('Your credit score')).toHaveValue('702');
    await s.getByLabel('Your credit score').fill('712');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByTestId('credit-score-latest')).toHaveText('655');
    await expect(change).toHaveText('▼ Down 57 points since Aug 3');

    // Delete the newest check: the one before becomes the latest. Undo brings it back.
    await history.nth(0).click();
    s = sheet(page, 'credit-score-sheet');
    await s.getByRole('button', { name: 'Delete this score' }).click();
    await expect(dialog(page)).toContainText('Delete this credit score?');
    await expect(dialog(page)).toContainText('655 from Oct 8');
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByTestId('credit-score-latest')).toHaveText('712');
    await expect(page.getByTestId('credit-score-band')).toHaveText('Good');
    await expect(change).toHaveText('▲ Up 22 points since Jun 3');
    expect((await stored(page)).creditScores).toHaveLength(2);

    await undoButton(page).click();
    await expect(page.getByTestId('credit-score-latest')).toHaveText('655');
    expect((await stored(page)).creditScores.map((c) => c.score)).toEqual([690, 712, 655]);

    // Home shows the latest score too.
    await back(page);
    const card = page.getByTestId('home-networth');
    await expect(card.getByTestId('home-credit-score')).toHaveText(/Credit score 655\s*Fair/);
    await expect(card).toContainText('Add your savings and other accounts to see your net worth.');
  });

  test('accounts and credit scores are still there after a reload', async ({ page }) => {
    await openApp(page, budget());
    await openNetWorth(page, 'Track your net worth');
    await page.getByRole('button', { name: 'Add an account' }).click();
    let s = sheet(page, 'account-sheet');
    await choose(s, /^Retirement or pension/);
    await s.getByLabel('Name').fill('SERS');
    await s.getByLabel('How much is in it now?').fill('11800');
    await s.getByRole('button', { name: 'Add account' }).click();
    await expect(s).toBeHidden();
    await page.getByRole('button', { name: 'Add your credit score' }).click();
    s = sheet(page, 'credit-score-sheet');
    await s.getByLabel('Your credit score').fill('745');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expect(s).toBeHidden();

    await page.reload();
    // A reload starts back on Home.
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await expectCents(page.getByTestId('home-networth-total'), 1_180_000);
    await expect(page.getByTestId('home-credit-score')).toContainText('745');
    await openNetWorth(page);
    await expect(page.getByRole('button', { name: /^SERS, Retirement, \$11,800, updated today\. Edit$/ })).toBeVisible();
    await expectCents(page.getByTestId('networth-total'), 1_180_000);
    await expect(page.getByTestId('credit-score-latest')).toHaveText('745');
    await expect(page.getByTestId('credit-score-band')).toHaveText('Very good');
    const d = await stored(page);
    expect(d.accounts).toEqual([expect.objectContaining({ name: 'SERS', type: 'retirement', balance: 1_180_000 })]);
    expect(d.creditScores).toEqual([expect.objectContaining({ score: 745, date: TODAY })]);
  });

  test('the example budget: net worth is what you have minus what you owe', async ({ page }) => {
    const example = makeExampleBudget(TODAY);
    const have = example.accounts.reduce((a, x) => a + x.balance, 0);
    const owe = example.debts.reduce((a, x) => a + x.balance, 0);
    await openApp(page, example);
    await expectCents(page.getByTestId('home-networth-total'), have - owe);
    await expect(page.getByTestId('home-credit-score')).toContainText('712');
    await openNetWorth(page);
    await expectCents(page.getByTestId('networth-have'), have);
    await expectCents(page.getByTestId('networth-owe'), owe);
    await expectCents(page.getByTestId('networth-total'), have - owe);
    await expect(accountRows(page)).toHaveCount(example.accounts.length);
    await expect(page.getByTestId('credit-score-latest')).toHaveText('712');
    await expect(page.getByTestId('credit-score-band')).toHaveText('Good');
    await expect(page.getByTestId('credit-score-change')).toContainText('10 points since Aug 3');
  });
});

test.describe('Net worth: no horizontal scrolling at 375px', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('example budget, long names, big amounts and open sheets', async ({ page }) => {
    await openApp(page, makeExampleBudget(TODAY));
    await expectNoHorizontalScroll(page, 'Home with the Net worth card');
    await openNetWorth(page);
    await expectNoHorizontalScroll(page, 'Net worth (example)');
    await page.getByRole('button', { name: 'Add an account' }).click();
    await expect(sheet(page, 'account-sheet')).toBeVisible();
    await expectNoHorizontalScroll(page, 'Add account sheet');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet(page, 'account-sheet')).toBeHidden();
    await page.getByRole('button', { name: 'Update credit score' }).click();
    const s = sheet(page, 'credit-score-sheet');
    await s.getByLabel('Your credit score').fill('900');
    await s.getByRole('button', { name: 'Save score' }).click();
    await expectFieldError(s.getByLabel('Your credit score'), 'Credit scores go from 300 to 850');
    await expectNoHorizontalScroll(page, 'Credit score sheet with an error');
  });

  test('long names and the biggest amounts', async ({ page }) => {
    await openApp(
      page,
      budget({
        debts: [debt({ name: 'Pneumonoultramicroscopicsilicovolcanoconiosis', balance: 999_999_999 })],
        accounts: [
          account({ name: 'Supercalifragilisticexpialidocious Savings', balance: 999_999_999, updatedAt: '2025-01-15' }),
          account({ id: 'acc-2', name: 'Antidisestablishmentarianism', type: 'retirement', balance: 999_999_999 }),
          account({ id: 'acc-3', name: 'Roth', type: 'roth', balance: 1 }),
        ],
        creditScores: [score({ score: 300, date: '2024-02-29' }), score({ id: 'cs-2', score: 850 })],
      }),
    );
    await expectNoHorizontalScroll(page, 'Home with big net worth');
    await openNetWorth(page);
    await expect(page.getByTestId('networth-total')).toBeVisible();
    await expectNoHorizontalScroll(page, 'Net worth (long names, big amounts)');
  });
});
