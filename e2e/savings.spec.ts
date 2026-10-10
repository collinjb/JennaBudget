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
  NEXT_MONTH,
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

    // Edit (the row opens its details; Edit turns them into the form): rename, change amount, make it a nice-to-have.
    await page.getByRole('button', { name: /^Gas/ }).click();
    await sheet(page, 'spending-detail-sheet').getByRole('button', { name: 'Edit Gas' }).click();
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
    await sheet(page, 'spending-detail-sheet').getByRole('button', { name: 'Edit Road trips' }).click();
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
    await expect(car.getByTestId(/^goal-this-month-/)).toHaveText('This month: $0 of $250 saved');
    await expect(page.getByText('Saving $350 this month')).toBeVisible();

    // Edit: add a target date → the monthly amount becomes automatic (the monthly field goes away).
    await page.getByRole('button', { name: 'Edit New Car' }).click();
    s = sheet(page, 'goal-sheet');
    await expect(s.getByRole('heading', { name: 'Edit goal' })).toBeVisible();
    await expect(s.getByText('Want it to catch up automatically if you miss a month? Add a target date.')).toBeVisible();
    await switchOn(s, 'Reach it by a certain date');
    await expect(s.getByLabel('Add each month')).toHaveCount(0);
    await s.getByLabel('Target date').fill('2027-10-15');
    // $4,500 over the 13 months October 2026 … October 2027 = $346.15, rounded up to whole dollars.
    const auto = s.getByTestId('goal-auto-amount');
    await expect(auto).toContainText("We'll set aside about $347 a month.");
    await expect(auto).toContainText('If a month comes up short, the next months go up a little so you still make it.');
    // The amount follows what's typed.
    await s.getByLabel('Goal amount').fill('5800');
    await expect(auto).toContainText("We'll set aside about $408 a month.");
    await s.getByLabel('Goal amount').fill('5000');
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expect(car).toContainText('Set aside $347 this month to reach $5,000 by October 2027.');
    await expect(car).toContainText('Target date: Oct 2027');
    await expect(car.getByTestId(/^goal-this-month-/)).toHaveText('This month: $0 of $347 saved');
    // The automatic amount is what the budget sets aside (the old $250 is kept for if the date is removed).
    await expect(page.getByText('Saving $447 this month')).toBeVisible();
    expect((await stored(page)).goals[1]).toEqual(expect.objectContaining({ monthly: 25_000, targetDate: '2027-10-15' }));

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
    // Starts with this month's amount.
    await expect(s.getByLabel('How much did you put in?')).toHaveValue('100');
    await expect(s.getByText("That's this month's $100.")).toBeVisible();
    await s.getByLabel('How much did you put in?').fill('100.50');
    await s.getByRole('button', { name: 'Add to Trip' }).click();
    await expect(s).toBeHidden();
    await expect(trip).toContainText('$300.50 of $1,000');
    await expect(trip.getByRole('progressbar', { name: 'Trip progress' })).toHaveAttribute('aria-valuenow', '30');
    await expect(trip.getByTestId(/^goal-this-month-/)).toHaveText("This month's $100 is saved");
    const g = (await stored(page)).goals[0];
    expect(g.saved).toBe(30_050);
    expect(g.monthDeposit).toEqual({ month: '2026-10', amount: 10_050 });
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
    await expect(card).toContainText('Target date: Oct 2026');
    // …so the goal must not immediately say the date has passed; it says what's still needed instead.
    await expect(card).not.toContainText('This date has passed');
    await expect(card).toContainText('Set aside $150 this month to reach $200 by Oct 30.');
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

test.describe('Savings & Fun: goals with a date set their own monthly amount', () => {
  /**
   * $1,300 by September 2027. Last month (September) only $20 went in instead of the $100 it needed, so October has to
   * make up for it: $1,280 left over the 12 months October … September = $106.67, rounded up to $107.
   */
  const shortLastMonth = () =>
    budget({
      incomes: [income()],
      goals: [
        goal({
          name: 'Trip',
          target: 130_000,
          saved: 2_000,
          monthly: 10_000,
          targetDate: '2027-09-15',
          monthDeposit: { month: '2026-09', amount: 2_000 },
        }),
      ],
    });

  test('a short month raises the next months, and Left Over follows', async ({ page }) => {
    const data = shortLastMonth();
    const id = data.goals[0].id;
    await openApp(page, data);
    // $2,000 − $107 (not the goal's old $100 a month).
    await expect(page.getByTestId('left-over')).toHaveText('$1,893');
    await expectCents(page.getByTestId('breakdown-savings'), 10_700);
    await expect(page.getByTestId(`goal-this-month-${id}`)).toHaveText('This month: $0 of $107 saved');

    await goTab(page, 'Savings & Fun');
    const trip = goalCard(page, 'Trip');
    await expect(trip).toContainText('Set aside $107 this month to reach $1,300 by September 2027.');
    await expect(page.getByText('Saving $107 this month')).toBeVisible();

    // October also comes up short: only $50 goes in. This month's amount stays put while money goes in…
    await page.getByRole('button', { name: 'Add money to Trip' }).click();
    const s = sheet(page, 'add-money-sheet');
    await s.getByLabel('How much did you put in?').fill('50');
    await s.getByRole('button', { name: 'Add to Trip' }).click();
    await expect(s).toBeHidden();
    await expect(trip).toContainText('Set aside $107 this month');
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$1,893');

    // …and November picks up the difference: $1,230 left over the 11 months November … September = $112.
    await page.clock.setFixedTime(NEXT_MONTH);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'November' })).toBeVisible();
    await expect(page.getByTestId('left-over')).toHaveText('$1,888');
    await expect(page.getByTestId(`goal-this-month-${id}`)).toHaveText('This month: $0 of $112 saved');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Savings & Fun', exact: true }).click();
    await expect(trip).toContainText('Set aside $112 this month to reach $1,300 by September 2027.');
  });

  test('"Add money" updates "This month: $X of $Y saved"', async ({ page }) => {
    const data = shortLastMonth();
    const id = data.goals[0].id;
    await openApp(page, data);
    await goTab(page, 'Savings & Fun');
    const month = page.getByTestId(`goal-this-month-${id}`);
    await expect(month).toHaveText('This month: $0 of $107 saved');

    await page.getByRole('button', { name: 'Add money to Trip' }).click();
    let s = sheet(page, 'add-money-sheet');
    const field = s.getByLabel('How much did you put in?');
    await expect(field).toHaveValue('107');
    await expect(field).toHaveAccessibleDescription("That's this month's $107.");
    await field.fill('50');
    await s.getByRole('button', { name: 'Add to Trip' }).click();
    await expect(s).toBeHidden();
    await expect(month).toHaveText('This month: $50 of $107 saved');
    await expect(month.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '47');
    await expect(goalCard(page, 'Trip')).toContainText('$70 of $1,300');

    // The rest of this month's amount is filled in next time.
    await page.getByRole('button', { name: 'Add money to Trip' }).click();
    s = sheet(page, 'add-money-sheet');
    await expect(s.getByLabel('How much did you put in?')).toHaveValue('57');
    await expect(s.getByText("That's what's left of this month's $107.")).toBeVisible();
    await s.getByRole('button', { name: 'Add to Trip' }).click();
    await expect(s).toBeHidden();
    await expect(month).toHaveText("This month's $107 is saved");
    expect((await stored(page)).goals[0]).toEqual(
      expect.objectContaining({ saved: 12_700, monthDeposit: { month: '2026-10', amount: 10_700 } }),
    );

    // Home shows the same line, and Left Over doesn't move (this month's $107 was already set aside).
    await goTab(page, 'Home');
    await expect(page.getByTestId(`goal-this-month-${id}`)).toHaveText("This month's $107 is saved");
    await expect(page.getByTestId('left-over')).toHaveText('$1,893');

    // Extra money is welcome too.
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: 'Add money to Trip' }).click();
    s = sheet(page, 'add-money-sheet');
    await expect(s.getByLabel('How much did you put in?')).toHaveValue('');
    await expect(
      s.getByText("This month's $107 is already saved. Anything extra makes the next months a little smaller."),
    ).toBeVisible();
  });

  test('a past date falls back to the monthly amount and says so', async ({ page }) => {
    await openApp(
      page,
      budget({ incomes: [income()], goals: [goal({ name: 'Trip', targetDate: '2026-09-30', monthly: 10_000 })] }),
    );
    await expect(page.getByTestId('left-over')).toHaveText('$1,900');
    await goTab(page, 'Savings & Fun');
    const trip = goalCard(page, 'Trip');
    await expect(trip).toContainText('This date has passed. Pick a new one?');
    await expect(trip).toContainText('$100 a month');
    await expect(trip.getByTestId(/^goal-this-month-/)).toHaveText('This month: $0 of $100 saved');
  });
});
