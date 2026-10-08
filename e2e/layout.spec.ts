import type { Page } from '@playwright/test';
import {
  bill,
  budget,
  debt,
  expect,
  expectNoHorizontalScroll,
  goal,
  goTab,
  income,
  openApp,
  openSettings,
  spending,
  test,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

// Runs at each project's real width: iPhone SE = 375px, iPhone 15 = 393px, Pro Max = 430px.
test.describe('Layout: no horizontal scrolling', () => {
  async function checkAllScreens(page: Page) {
    await expectNoHorizontalScroll(page, 'Home');
    for (const t of ['Money In', 'Bills', 'Savings & Fun', 'Debt'] as const) {
      await goTab(page, t);
      await expectNoHorizontalScroll(page, t);
    }
    await goTab(page, 'Home');
    await openSettings(page);
    await expectNoHorizontalScroll(page, 'Settings');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'See your paycheck plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Paycheck Plan' })).toBeVisible();
    await expectNoHorizontalScroll(page, 'Paycheck Plan');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByTestId('plan-card').getByRole('button').first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Smart Plan' })).toBeVisible();
    await expectNoHorizontalScroll(page, 'Smart Plan');
  }

  test('every screen with the example budget', async ({ page }) => {
    await openApp(page);
    await expectNoHorizontalScroll(page, 'Welcome');
    await page.getByRole('button', { name: 'Just let me look around with example numbers' }).click();
    await expect(page.getByTestId('left-over')).toBeVisible();
    await checkAllScreens(page);
  });

  test('every screen with long names and big amounts', async ({ page }) => {
    const long = 'Supercalifragilisticexpialidocious Bill';
    await openApp(
      page,
      budget(
        {
          incomes: [income({ name: 'Extraordinarily Long Paycheck Name Here', amount: 999_999_999, frequency: 'weekly', payDate: '2026-10-09' })],
          bills: [bill({ name: long, amount: 123_456_789 }), bill({ name: 'Antidisestablishmentarianism', amount: 99_999_999, frequency: 'yearly', dueDate: '2027-03-31', dueDay: 31 })],
          debts: [debt({ name: 'Pneumonoultramicroscopicsilicovolcanoconiosis', balance: 999_999_999, minPayment: 50_000_000, rateBps: 2999 })],
          spending: [spending({ name: 'Incomprehensibilities Shopping Money', monthly: 5_000_000 })],
          goals: [goal({ name: 'Honorificabilitudinitatibus Vacation', target: 999_999_999, saved: 12_345_678, monthly: 1_000_000, targetDate: '2030-12-31' })],
        },
        { extraDebtPayment: 100_000 },
      ),
    );
    await expect(page.getByTestId('left-over')).toBeVisible();
    await checkAllScreens(page);
  });

  test('over budget Home and the Smart Plan levers', async ({ page }) => {
    await openApp(page, budget({ incomes: [income({ amount: 50_000 })], bills: [bill({ amount: 1_999_900 })] }));
    await expect(page.getByTestId('left-over')).toContainText('over');
    await expectNoHorizontalScroll(page, 'Home (over)');
    await page.getByRole('button', { name: "Here's how to fix it" }).click();
    await expectNoHorizontalScroll(page, 'Smart Plan (infeasible)');
  });

  test('onboarding steps and an open sheet', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: "Let's get started" }).click();
    await expectNoHorizontalScroll(page, 'Onboarding step 1');
    await page.getByLabel('Take-home pay (one paycheck)').fill('1450');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    for (const chip of ['Rent', 'Phone', 'Car Insurance', 'Internet']) {
      await page.getByRole('button', { name: chip, exact: true }).click();
    }
    await expectNoHorizontalScroll(page, 'Onboarding step 2');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Credit Card', exact: true }).click();
    await expectNoHorizontalScroll(page, 'Onboarding step 3');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Emergency Fund', exact: true }).click();
    await page.getByRole('button', { name: 'Groceries', exact: true }).click();
    await expectNoHorizontalScroll(page, 'Onboarding step 4');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();

    await goTab(page, 'Bills');
    await page.getByRole('button', { name: 'Add your first bill' }).click();
    const s = page.getByTestId('bill-sheet');
    await s.getByRole('button', { name: /^Change bill icon/ }).click();
    await expectNoHorizontalScroll(page, 'Bill sheet with emoji picker');
  });

  test('the tab bar keeps a steady height (no resize feedback loop)', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()] }));
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    const heights = await nav.evaluate(async (el) => {
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const out: number[] = [];
      for (let i = 0; i < 30; i++) {
        await frame();
        if (i % 10 === 0 || i === 29) out.push(Math.round(el.getBoundingClientRect().height));
      }
      return out;
    });
    expect(new Set(heights).size, `tab bar heights over 30 frames: ${heights.join(', ')}`).toBe(1);
    expect(heights[0]).toBeLessThan(120);
  });

  test('inputs use at least 16px text (no zoom on focus)', async ({ page }) => {
    await openApp(page, budget({ incomes: [income()] }));
    await goTab(page, 'Savings & Fun');
    await page.getByRole('button', { name: 'Add a savings goal' }).click();
    const sizes = await page
      .getByTestId('goal-sheet')
      .locator('input:not([type=checkbox]):not([type=radio]), select')
      .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(sizes.length).toBeGreaterThan(3);
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(16);
  });
});
