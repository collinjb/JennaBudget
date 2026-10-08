import type { Page } from '@playwright/test';
import {
  budget,
  choose,
  dialog,
  expect,
  expectCents,
  expectFieldError,
  goal,
  goTab,
  income,
  openApp,
  sheet,
  standardBudget,
  stored,
  switchOn,
  test,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

const goalCard = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });

test.describe('Savings & Fun: spending money', () => {
  test('add, edit, delete and undo spending money', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Savings & Fun');
    await expect(page.getByText('$400 a month', { exact: true })).toBeVisible();

    // Add with a quick-pick chip (Gas is a must-have).
    await page.getByRole('button', { name: 'Add spending money' }).click();
    let s = sheet(page, 'spending-sheet');
    await s.getByRole('button', { name: 'Gas', exact: true }).click();
    await expect(s.getByRole('radio', { name: 'Must-have' })).toBeChecked();
    await s.getByLabel('How much each month?').fill('120');
    await s.getByRole('button', { name: 'Add spending money' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByRole('button', { name: /^Gas Must-have \$120/ })).toBeVisible();
    await expect(page.getByText('$520 a month', { exact: true })).toBeVisible();

    // Edit: rename, change amount and make it a nice-to-have.
    await page.getByRole('button', { name: /^Gas/ }).click();
    s = sheet(page, 'spending-sheet');
    await expect(s.getByRole('heading', { name: 'Edit spending' })).toBeVisible();
    await s.getByLabel('Name').fill('Road trips');
    await s.getByLabel('How much each month?').fill('150.25');
    await choose(s, 'Nice-to-have');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByRole('button', { name: /^Road trips Nice-to-have \$150\.25/ })).toBeVisible();
    await expect(page.getByText('$550.25 a month', { exact: true })).toBeVisible();

    // Delete + Undo.
    await page.getByRole('button', { name: /^Road trips/ }).click();
    await sheet(page, 'spending-sheet').getByRole('button', { name: 'Delete this' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: /^Road trips/ })).toHaveCount(0);
    await expect(page.getByText('$400 a month', { exact: true })).toBeVisible();
    await undoButton(page).click();
    await expect(page.getByRole('button', { name: /^Road trips/ })).toBeVisible();
    const d = await stored(page);
    expect(d.spending.at(-1)).toEqual(expect.objectContaining({ name: 'Road trips', monthly: 15_025, kind: 'fun' }));

    // Home: Spending & Fun part follows.
    await goTab(page, 'Home');
    await expectCents(page.getByTestId('breakdown-spending'), 55_000);
  });
});

test.describe('Savings & Fun: goals', () => {
  test('add, edit, delete and undo a goal', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Savings & Fun');

    await page.getByRole('button', { name: 'Add a savings goal' }).click();
    let s = sheet(page, 'goal-sheet');
    await s.getByRole('button', { name: 'New Car', exact: true }).click();
    await s.getByLabel('Goal amount').fill('5000');
    await s.getByLabel('Saved so far').fill('500');
    await s.getByLabel('Add each month').fill('250');
    await s.getByRole('button', { name: 'Add goal' }).click();
    await expect(s).toBeHidden();
    const car = goalCard(page, 'New Car');
    await expect(car).toContainText('$500 of $5,000');
    await expect(car).toContainText('10%');
    // $4,500 left at $250/month = 18 months from October 2026.
    await expect(car).toContainText("At $250/month you'll reach this by April 2028");
    await expect(page.getByText('Saving $350 a month')).toBeVisible();

    // Edit: add a target date it can't make → "behind" warning with the needed amount.
    await page.getByRole('button', { name: 'Edit New Car' }).click();
    s = sheet(page, 'goal-sheet');
    await expect(s.getByRole('heading', { name: 'Edit goal' })).toBeVisible();
    await switchOn(s, 'Reach it by a certain date');
    await s.getByLabel('Target date').fill('2027-10-15');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    // $4,500 over 12 months = $375/month needed.
    await expect(car).toContainText('To reach $5,000 by October 2027, save $375/month');

    // A past date is rejected.
    await page.getByRole('button', { name: 'Edit New Car' }).click();
    s = sheet(page, 'goal-sheet');
    await s.getByLabel('Target date').fill('2026-01-01');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expectFieldError(s.getByLabel('Target date'), 'Please pick a date in the future.');
    await s.getByRole('button', { name: 'Cancel' }).click();
    await expect(s).toBeHidden();

    // Delete + Undo.
    await page.getByRole('button', { name: 'Edit New Car' }).click();
    await sheet(page, 'goal-sheet').getByRole('button', { name: 'Delete this goal' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(car).toHaveCount(0);
    await undoButton(page).click();
    await expect(car).toBeVisible();
    expect((await stored(page)).goals.map((g) => g.name)).toEqual(['Trip', 'New Car']);
  });

  test('"Add money" adds to the saved amount', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Savings & Fun');
    const trip = goalCard(page, 'Trip');
    await expect(trip).toContainText('$200 of $1,000');
    await page.getByRole('button', { name: 'Add money to Trip' }).click();
    const s = sheet(page, 'add-money-sheet');
    await expect(s).toContainText('Trip: $200 saved of $1,000. $800 to go.');
    await s.getByLabel('How much did you put in?').fill('100.50');
    await s.getByRole('button', { name: 'Add to Trip' }).click();
    await expect(s).toBeHidden();
    await expect(trip).toContainText('$300.50 of $1,000');
    await expect(trip.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
    expect((await stored(page)).goals[0].saved).toBe(30_050);
  });

  test('reaching a goal shows the celebration and stops counting it in the budget', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()], goals: [goal({ saved: 90_000, target: 100_000 })] }));
    await expect(page.getByTestId('left-over')).toHaveText('$1,900');
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: 'Add money to Trip' }).click();
    const s = sheet(page, 'add-money-sheet');
    await s.getByLabel('How much did you put in?').fill('100');
    await s.getByRole('button', { name: 'Add to Trip' }).click();
    const party = page.getByRole('dialog', { name: 'You did it!' });
    await expect(party).toBeVisible();
    await expect(party).toContainText('You reached your Trip goal. 🎉');
    await party.getByRole('button', { name: 'Done' }).click();
    await expect(party).toBeHidden();
    const trip = goalCard(page, 'Trip');
    await expect(trip).toContainText('🎉 You did it!');
    await expect(trip).toContainText('100%');
    await expect(page.getByRole('button', { name: 'Add money to Trip' })).toHaveCount(0);
    // A reached goal no longer takes money each month.
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$2,000');
    await expectCents(page.getByTestId('breakdown-savings'), 0);
  });

  test('empty state buttons open the right sheets', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()] }));
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: 'Add a savings goal' }).click();
    await expect(sheet(page, 'goal-sheet')).toBeVisible();
    await sheet(page, 'goal-sheet').getByRole('button', { name: 'Save', exact: true }).click();
    await expectFieldError(sheet(page, 'goal-sheet').getByLabel('Goal amount'), 'Please enter an amount');
    await sheet(page, 'goal-sheet').getByLabel('Goal amount').fill('1000');
    await sheet(page, 'goal-sheet').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(sheet(page, 'goal-sheet')).toBeHidden();
    // A blank name gets a sensible default.
    await expect(goalCard(page, 'Savings goal')).toContainText('$0 of $1,000');
    await expect(goalCard(page, 'Savings goal')).toContainText("Add a monthly amount to see when you'll get there");
    await page.getByRole('button', { name: 'Add spending money' }).click();
    await expect(sheet(page, 'spending-sheet')).toBeVisible();
  });

  test('a target date later this month is not called "passed"', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()], goals: [goal({ name: 'Concert', target: 20_000, saved: 5_000, monthly: 0 })] }));
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: 'Edit Concert' }).click();
    const s = sheet(page, 'goal-sheet');
    await switchOn(s, 'Reach it by a certain date');
    // Oct 30 is 22 days away, so the sheet accepts it as a future date…
    await s.getByLabel('Target date').fill('2026-10-30');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    const card = goalCard(page, 'Concert');
    await expect(card).toContainText('by Oct 2026');
    // …so the goal must not immediately say the date has passed; it says what's still needed instead.
    await expect(card).not.toContainText('This date has passed');
    await expect(card).toContainText(/To reach \$200 by .+, save \$150/);
  });

  test('one safety net at a time', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [income()],
        goals: [goal({ name: 'Rainy Day', isEmergencyFund: true }), goal({ name: 'Trip' })],
      }),
    );
    await goTab(page, 'Savings & Fun');
    await expect(goalCard(page, 'Rainy Day')).toContainText('Safety net');
    await page.getByRole('button', { name: 'Edit Trip' }).click();
    const s = sheet(page, 'goal-sheet');
    await switchOn(s, 'This is my safety net (emergency fund)');
    await expect(s.getByText('This will replace Rainy Day as your safety net.')).toBeVisible();
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expect(goalCard(page, 'Trip')).toContainText('Safety net');
    await expect(goalCard(page, 'Rainy Day')).not.toContainText('Safety net');
  });
});
