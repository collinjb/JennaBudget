import { bill, budget, expect, income, openApp, sheet, stored, test } from './helpers';

// Today in these tests is Thu Oct 8 2026. Paid every 2 weeks, next payday Fri Oct 16; phone due Oct 12.
const base = (accounts: ReturnType<typeof budget>['accounts'] = []) =>
  budget({
    incomes: [income({ name: 'Owens Paycheck', amount: 136_500, frequency: 'biweekly', payDate: '2026-10-16' })],
    bills: [bill({ name: 'Phone', emoji: '📱', amount: 6_500, dueDay: 12 })],
    accounts,
  });

test.describe('Right now (money in checking)', () => {
  test('add the checking balance from Home, then see what is safe to use today', async ({ page }) => {
    await openApp(page, base());
    const card = page.getByTestId('right-now');
    await expect(card).toContainText("Add what's in your checking account");
    await card.getByRole('button', { name: 'Add my checking balance' }).click();
    const s = sheet(page, 'account-sheet');
    await expect(s).toBeVisible();
    await s.getByLabel('How much is in it now?').fill('1000');
    await s.getByRole('button', { name: 'Add account' }).click();
    await expect(s).toBeHidden();

    await expect(page.getByTestId('right-now-checking')).toHaveAttribute('data-cents', '100000');
    await expect(card).toContainText('updated today');
    // Phone ($65, Oct 12) is due before the Oct 16 paycheck.
    await expect(card).toContainText('Bills before your next paycheck (Fri, Oct 16 (Owens Paycheck)): Phone on Oct 12');
    await expect(page.getByTestId('right-now-safe')).toHaveAttribute('data-cents', '93500');
    const saved = await stored(page);
    expect(saved.accounts).toEqual([expect.objectContaining({ type: 'checking', balance: 100_000 })]);
  });

  test('update the balance in one tap; a low balance says how short it is', async ({ page }) => {
    await openApp(page, base([{ id: 'chk', name: 'Checking', type: 'checking', balance: 100_000, updatedAt: '2026-10-01' }]));
    const card = page.getByTestId('right-now');
    await expect(card).toContainText('as of Oct 1');
    await expect(card).toContainText("Update your checking balance for today's number.");
    await card.getByRole('button', { name: 'Update' }).click();
    const s = sheet(page, 'account-balance-sheet');
    await s.getByLabel('Balance now').fill('50');
    await s.getByRole('button', { name: 'Update balance' }).click();
    await expect(s).toBeHidden();
    await expect(page.getByTestId('right-now-short')).toContainText('$15 short');
    await expect(card).toContainText('updated today');
  });

  test('a bill already marked paid is not counted again', async ({ page }) => {
    const data = base([{ id: 'chk', name: 'Checking', type: 'checking', balance: 100_000, updatedAt: '2026-10-08' }]);
    data.bills = data.bills.map((b) => ({ ...b, paidMonth: '2026-10' }));
    await openApp(page, data);
    await expect(page.getByTestId('right-now-safe')).toHaveAttribute('data-cents', '100000');
  });
});
