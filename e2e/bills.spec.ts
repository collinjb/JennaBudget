import {
  bill,
  budget,
  dialog,
  expect,
  expectCents,
  goTab,
  income,
  NEXT_MONTH,
  openApp,
  sheet,
  standardBudget,
  stored,
  test,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Bills', () => {
  test('add (quick-pick chip), edit, delete and undo a bill; total updates live', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    const total = page.getByTestId('bills-total');
    await expectCents(total, 86_000);

    await page.getByRole('button', { name: 'Add a bill' }).click();
    let s = sheet(page, 'bill-sheet');
    await s.getByRole('button', { name: 'Gym', exact: true }).click();
    await expect(s.getByLabel('Name')).toHaveValue('Gym');
    await s.getByLabel('Amount').fill('45.50');
    await s.getByLabel('Due on').selectOption('5');
    await s.getByRole('button', { name: 'Add bill' }).click();
    await expect(s).toBeHidden();
    await expectCents(total, 90_550);
    const gym = page.getByRole('button', { name: /^Gym, \$45\.50, Due Oct 5/ });
    await expect(gym).toBeVisible();
    await expect(page.getByTestId('bills-progress')).toHaveText('0 of 3 bills paid · $905.50 to go');

    // Edit: becomes a yearly $120 bill → $10/mo, shown under "Not due this month" with "≈".
    await gym.click();
    s = sheet(page, 'bill-sheet');
    await expect(s.getByRole('heading', { name: 'Edit bill' })).toBeVisible();
    await s.getByLabel('Amount').fill('120');
    await s.getByLabel('How often?').selectOption('yearly');
    await s.getByLabel('Next due date').fill('2027-03-01');
    await expect(s.getByText('$120/yr ≈ $10/mo')).toBeVisible();
    await s.getByRole('button', { name: 'Save changes' }).click();
    await expect(s).toBeHidden();
    await expectCents(total, 87_000);
    await expect(total).toHaveText('≈ $870');
    await expect(page.getByRole('heading', { name: 'Not due this month' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Gym, \$120, Next due Mar 1/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Gym paid' })).toHaveCount(0);

    // Delete + Undo.
    await page.getByRole('button', { name: /^Gym,/ }).click();
    await sheet(page, 'bill-sheet').getByRole('button', { name: 'Delete this bill' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('status')).toContainText('Deleted “Gym”');
    await expect(page.getByRole('button', { name: /^Gym,/ })).toHaveCount(0);
    await expectCents(total, 86_000);
    await undoButton(page).click();
    await expect(page.getByRole('button', { name: /^Gym,/ })).toBeVisible();
    await expectCents(total, 87_000);
    expect((await stored(page)).bills.map((b) => b.name)).toEqual(['Rent', 'Phone', 'Gym']);
  });

  test('the Undo toast goes away on its own and the delete sticks', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: /^Phone,/ }).click();
    await sheet(page, 'bill-sheet').getByRole('button', { name: 'Delete this bill' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(undoButton(page)).toBeVisible();
    await expect(undoButton(page)).toBeHidden({ timeout: 15_000 });
    await page.reload();
    await goTab(page, 'Bills');
    await expect(page.getByRole('button', { name: /^Phone,/ })).toHaveCount(0);
    await expectCents(page.getByTestId('bills-total'), 80_000);
  });

  test('paid checkboxes update progress and are saved', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    const progress = page.getByTestId('bills-progress');
    await expect(progress).toHaveText('0 of 2 bills paid · $860 to go');
    await page.getByRole('checkbox', { name: 'Rent paid' }).check();
    await expect(progress).toHaveText('1 of 2 bills paid · $60 to go');
    await expect(page.getByRole('button', { name: /^Rent,/ })).toContainText('Paid ✓');
    await page.getByRole('checkbox', { name: 'Phone paid' }).check();
    await expect(progress).toHaveText('All 2 bills paid this month 🎉');
    await page.getByRole('checkbox', { name: 'Phone paid' }).uncheck();
    await expect(progress).toHaveText('1 of 2 bills paid · $60 to go');
    const d = await stored(page);
    expect(d.bills.map((b) => [b.name, b.paidMonth])).toEqual([
      ['Rent', '2026-10'],
      ['Phone', null],
    ]);
    // Paying a bill doesn't change the monthly budget.
    await goTab(page, 'Home');
    await expect(page.getByTestId('left-over')).toHaveText('$540');
  });

  test('monthly reset: a bill paid in October is unpaid again in November', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    await page.getByRole('checkbox', { name: 'Rent paid' }).check();
    await page.getByRole('checkbox', { name: 'Phone paid' }).check();
    await expect(page.getByTestId('bills-progress')).toHaveText('All 2 bills paid this month 🎉');
    await page.reload();
    await goTab(page, 'Bills');
    await expect(page.getByRole('checkbox', { name: 'Rent paid' })).toBeChecked();

    // Move the clock into next month and reopen the app.
    await page.clock.setFixedTime(NEXT_MONTH);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'November' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Bills', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Due in November' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Rent paid' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Phone paid' })).not.toBeChecked();
    await expect(page.getByTestId('bills-progress')).toHaveText('0 of 2 bills paid · $860 to go');
  });

  test('monthly reset also happens without a reload when the app comes back to the foreground', async ({ page }) => {
    await openApp(page, standardBudget());
    await goTab(page, 'Bills');
    await page.getByRole('checkbox', { name: 'Rent paid' }).check();
    await expect(page.getByRole('heading', { name: 'Due in October' })).toBeVisible();
    // The phone sleeps over the month boundary; the app is brought back to the foreground.
    await page.clock.setFixedTime(NEXT_MONTH);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.getByRole('heading', { name: 'Due in November' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Rent paid' })).not.toBeChecked();
    await expect(page.getByTestId('bills-progress')).toHaveText('0 of 2 bills paid · $860 to go');
  });

  test('uses the local date: 11:30 pm on Oct 31 is still October (already Nov 1 in UTC)', async ({ page }) => {
    const data = standardBudget();
    data.bills[0].paidMonth = '2026-10';
    // 2026-11-01T04:30Z = Oct 31, 11:30 pm in America/Chicago.
    await openApp(page, data, { now: new Date('2026-11-01T04:30:00Z') });
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await goTab(page, 'Bills');
    await expect(page.getByRole('heading', { name: 'Due in October' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Rent paid' })).toBeChecked();
    // One hour later it is November locally.
    await page.clock.setFixedTime(new Date('2026-11-01T05:30:00Z'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'November' })).toBeVisible();
  });

  test('bills due this month are listed by due date', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [income()],
        bills: [
          bill({ name: 'Phone', emoji: '📱', amount: 6_000, dueDay: 20 }),
          bill({ name: 'Rent', dueDay: 1 }),
          bill({ name: 'Gym', emoji: '🏋️', amount: 3_000, dueDay: 31, dueDate: '2026-10-31' }),
          bill({ name: 'Netflix', emoji: '🎬', amount: 1_549, dueDay: 8 }),
        ],
      }),
    );
    await goTab(page, 'Bills');
    const names = await page.getByRole('checkbox', { name: / paid$/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(names).toEqual(['Rent paid', 'Netflix paid', 'Phone paid', 'Gym paid']);
    await expect(page.getByRole('button', { name: /^Gym, \$30, Due Oct 31/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Netflix, \$15\.49, Due Oct 8/ })).toBeVisible();
  });

  test('quarterly bill not due this month is listed separately and not counted as due', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [income()],
        bills: [
          bill(),
          bill({ name: 'Car Insurance', emoji: '🚗', amount: 36_000, frequency: 'quarterly', dueDay: 20, dueDate: '2026-11-20' }),
        ],
      }),
    );
    await goTab(page, 'Bills');
    // $800 + $360 ÷ 3 = $920 a month.
    await expectCents(page.getByTestId('bills-total'), 92_000);
    await expect(page.getByTestId('bills-progress')).toHaveText('0 of 1 bill paid · $800 to go');
    await expect(page.getByRole('button', { name: /^Car Insurance, \$360, Next due Nov 20/ })).toBeVisible();
  });
});
