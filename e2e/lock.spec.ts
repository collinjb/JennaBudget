import { ACCESS_HASH, DEVICE_KEY, expect, expectNoHorizontalScroll, openApp, standardBudget, test } from './helpers';

// The access code itself is never stored in the repo. To also test unlocking with the real code, run with
// E2E_ACCESS_CODE=<code>. Without it, the "right code" test is skipped (the hashing is unit-tested in src/lib).
const REAL_CODE = process.env.E2E_ACCESS_CODE;

const lockTitle = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: 'Enter your code' });

async function typeOnPad(page: import('@playwright/test').Page, code: string) {
  for (const d of code) await page.getByRole('button', { name: d, exact: true }).click();
}

test.describe('Access code on a new device', () => {
  test.skip(!ACCESS_HASH, 'No access code is set (src/access.json), so the app never asks.');
  test.use({ locked: true });

  test('a new device sees the code screen, not the budget', async ({ page }) => {
    await openApp(page, standardBudget());
    await expect(lockTitle(page)).toBeVisible();
    await expect(page.getByTestId('left-over')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expectNoHorizontalScroll(page, 'Lock screen');
  });

  test('a wrong code is rejected and the device stays locked', async ({ page }) => {
    await openApp(page, standardBudget());
    // Pick a code that isn't the real one (when the real one is known); otherwise any guess is almost surely wrong.
    const wrong = REAL_CODE === '1111' ? '2222' : '1111';
    await typeOnPad(page, wrong);
    await expect(page.getByText("That's not the code. Try again.")).toBeVisible();
    await expect(lockTitle(page)).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), DEVICE_KEY)).toBeNull();
    // Delete works and the dots reset.
    await page.getByRole('button', { name: '5', exact: true }).click();
    await expect(page.getByText('1 of 4 digits entered')).toBeAttached();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('0 of 4 digits entered')).toBeAttached();
  });

  test('too many wrong codes means a short wait', async ({ page }) => {
    await openApp(page, standardBudget());
    const wrong = REAL_CODE === '1111' ? '2222' : '1111';
    for (let i = 0; i < 5; i++) {
      await typeOnPad(page, wrong);
      if (i < 4) await expect(page.getByText("That's not the code. Try again.")).toBeVisible();
    }
    await expect(page.getByText(/Too many tries\. Try again in \d+ seconds\./)).toBeVisible();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
    // Still waiting after a reload.
    await page.reload();
    await expect(page.getByText(/Too many tries/)).toBeVisible();
  });

  test('the right code unlocks it, and the device is remembered', async ({ page }) => {
    test.skip(!REAL_CODE, 'Set E2E_ACCESS_CODE to test unlocking with the real code.');
    await openApp(page, standardBudget());
    await typeOnPad(page, REAL_CODE as string);
    // Straight into the budget (no welcome screen).
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    await page.reload();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    await expect(lockTitle(page)).toHaveCount(0);
  });

  test('a physical keyboard can type the code too', async ({ page }) => {
    test.skip(!REAL_CODE, 'Set E2E_ACCESS_CODE to test unlocking with the real code.');
    await openApp(page, standardBudget());
    await expect(lockTitle(page)).toBeVisible();
    await page.keyboard.type(REAL_CODE as string);
    await expect(page.getByTestId('left-over')).toHaveText('$540');
  });
});

test.describe('Access code on a remembered device', () => {
  test('opens straight to the budget', async ({ page }) => {
    await openApp(page, standardBudget());
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    await expect(lockTitle(page)).toHaveCount(0);
  });
});
