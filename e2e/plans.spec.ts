import {
  bill,
  budget,
  dialog,
  expect,
  expectHomeAddsUp,
  goal,
  income,
  openApp,
  parseMoney,
  spending,
  standardBudget,
  stored,
  test,
  undoButton,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Smart Plan', () => {
  test('suggestions with a "why", apply → numbers change → Undo restores', async ({ page }) => {
    const original = standardBudget();
    await openApp(page, original);
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    const card = page.getByTestId('plan-card');
    await expect(card).toContainText('We found a better way to split your money');
    await card.getByRole('button', { name: 'See the Smart Plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Plan' })).toBeVisible();

    // Every suggested change has a plain-English reason.
    const changes = page.getByRole('region', { name: 'Suggested changes' }).getByRole('listitem');
    const n = await changes.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(changes.nth(i)).toContainText(/Why\? \S+/);
    // No safety net yet → the plan proposes a new one.
    await expect(changes.filter({ hasText: 'Emergency Fund' })).toContainText('New');
    await expect(page.getByText('These are general budgeting guidelines, not professional financial advice.')).toBeVisible();

    // The impact card promises a new Left Over; Home must show exactly that after applying.
    const impact = page.locator('.impact-card');
    const leftLine = (await impact.getByText(/^Left over each month:/).textContent()) ?? '';
    const promised = parseMoney(leftLine.split('→')[1]);
    expect(parseMoney(leftLine.split('→')[0])).toBe(54_000);

    await page.getByRole('button', { name: 'Use this plan' }).click();
    await expect(dialog(page)).toContainText(`We'll update ${n} amount`);
    await dialog(page).getByRole('button', { name: 'Use this plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Smart Plan applied');
    await expect(page.getByTestId('left-over')).not.toHaveText('$540');
    expect(await page.getByTestId('left-over').getAttribute('data-cents')).toBe(String(Math.round(promised / 100) * 100));
    // Applying is idempotent: nothing more to suggest.
    await expect(card).toContainText('Your plan looks great');
    const applied = await stored(page);
    expect(applied.goals.some((g) => g.isEmergencyFund)).toBe(true);

    await undoButton(page).click();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    await expect(card).toContainText('We found a better way to split your money');
    expect(await stored(page)).toEqual(original);
  });

  test('over budget (too much fun and saving) → "how to fix it" → apply → no longer over', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [income()],
        bills: [bill({ amount: 100_000 })],
        spending: [spending({ name: 'Fun Money', emoji: '🎉', monthly: 80_000, kind: 'fun' })],
        goals: [goal({ monthly: 50_000 })],
      }),
    );
    await expect(page.getByTestId('left-over')).toHaveText("You're $300 over");
    await page.getByRole('button', { name: "Here's how to fix it" }).click();
    await expect(page.getByRole('heading', { name: 'We found a better way to split your money' })).toBeVisible();
    const fun = page.getByRole('region', { name: 'Suggested changes' }).getByRole('listitem').filter({ hasText: 'Fun Money' });
    await expect(fun).toContainText('Why?');
    await page.getByRole('button', { name: 'Use this plan' }).click();
    await dialog(page).getByRole('button', { name: 'Use this plan' }).click();
    await expect(page.getByTestId('left-over')).not.toContainText('over');
    expect(await page.getByTestId('left-over').getAttribute('data-cents').then(Number)).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.hero')).toHaveClass(/hero--left/);
    await expectHomeAddsUp(page);
  });

  test('cancelling the confirmation changes nothing', async ({ page }) => {
    await openApp(page, standardBudget());
    await page.getByTestId('plan-card').getByRole('button', { name: 'See the Smart Plan' }).click();
    await page.getByRole('button', { name: 'Use this plan' }).click();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
  });

  test('infeasible budget shows the shortfall and what to look at', async ({ page }) => {
    await openApp(
      page,
      budget({
        incomes: [income({ amount: 100_000 })],
        bills: [bill({ amount: 120_000 }), bill({ name: 'Phone', emoji: '📱', amount: 5_000, dueDay: 20 })],
      }),
    );
    const card = page.getByTestId('plan-card');
    await expect(card).toContainText('Your bills are more than your income');
    await expect(card).toContainText('$250 more');
    await card.getByRole('button', { name: 'See what could help' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your bills are more than your income' })).toBeVisible();
    await expect(page.getByText('$250 more', { exact: true })).toBeVisible();
    const levers = page.getByRole('region', { name: 'Biggest things to look at' }).getByRole('listitem');
    await expect(levers).toHaveCount(2);
    await expect(levers.nth(0)).toContainText('Rent');
    await expect(levers.nth(0)).toContainText('$1,200 a month');
    await expect(levers.nth(0)).toContainText('Could you lower, switch, or cancel this?');
    await expect(page.getByRole('button', { name: 'Use this plan' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Check Bills' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bills' })).toBeVisible();
  });
});

test.describe('Paycheck Plan', () => {
  const paycheckBudget = () =>
    budget({
      incomes: [
        income({ amount: 100_000, frequency: 'biweekly', payDate: '2026-10-09' }),
        income({ name: 'Side gig', amount: 12_000, frequency: 'biweekly', payDate: '2026-10-09' }),
      ],
      bills: [
        bill({ amount: 120_000, dueDay: 15 }),
        bill({ name: 'Phone', emoji: '📱', amount: 6_000, dueDay: 25 }),
      ],
    });

  test('Home shows the next paycheck with a short-by warning', async ({ page }) => {
    await openApp(page, paycheckBudget());
    const next = page.getByTestId('next-paycheck');
    await expect(next).toContainText('Fri, Oct 9');
    await expect(next).toContainText('$1,120');
    await expect(next).toContainText('Due before the next payday (Oct 23):');
    await expect(next).toContainText('Rent');
    await expect(next).toContainText('⚠️ This paycheck is short by $80. Set aside $80 from the paycheck before.');
  });

  test('four paydays, each with its items, totals and short-by warning', async ({ page }) => {
    await openApp(page, paycheckBudget());
    await page.getByRole('button', { name: 'See your paycheck plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Paycheck Plan' })).toBeVisible();
    await expect(page.getByText('Heads up: you get 3 paydays in January!')).toBeVisible();

    const w = (i: number) => page.getByTestId(`paycheck-window-${i}`);
    await expect(page.getByTestId(/^paycheck-window-\d$/)).toHaveCount(4);

    await expect(w(0).getByRole('heading', { name: 'Fri, Oct 9' })).toBeVisible();
    await expect(w(0)).toContainText('Paycheck $1,000 + Side gig $120');
    await expect(w(0)).toContainText('Due before Oct 23');
    await expect(w(0)).toContainText('Oct 15');
    await expect(w(0)).toContainText('Rent');
    await expect(w(0)).toContainText('Total due$1,200');
    await expect(w(0)).toContainText('Left from this paycheck-$80');
    await expect(w(0)).toContainText('⚠️ This paycheck is short by $80. Set aside $80 from the paycheck before.');

    await expect(w(1).getByRole('heading', { name: 'Fri, Oct 23' })).toBeVisible();
    await expect(w(1)).toContainText('Phone');
    await expect(w(1)).toContainText('Left from this paycheck$1,060');
    await expect(w(1)).not.toContainText('short by');

    await expect(w(2).getByRole('heading', { name: 'Fri, Nov 6' })).toBeVisible();
    await expect(w(2)).toContainText('short by $80');
    await expect(w(3).getByRole('heading', { name: 'Fri, Nov 20' })).toBeVisible();
    await expect(w(3)).toContainText('Phone');
    await expect(page.getByText("Savings and fun money come out of what's left.")).toBeVisible();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
  });

  test('a payday that is today counts as the next payday', async ({ page }) => {
    await openApp(page, budget({ incomes: [income({ payDate: '2026-10-08' })], bills: [bill({ dueDay: 20 })] }));
    const next = page.getByTestId('next-paycheck');
    await expect(next).toContainText('Thu, Oct 8');
    await expect(next).toContainText('Due before the next payday (Nov 8):');
    await expect(next).toContainText('$1,200 left');
  });

  test('browser back (iOS swipe-back) closes the page', async ({ page }) => {
    await openApp(page, paycheckBudget());
    await page.getByRole('button', { name: 'See your paycheck plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Paycheck Plan' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});
