import { expect, expectCents, goTab, openApp, sheet, standardBudget, stored, test } from './helpers';

// The real service worker from the production build (or the live site with BASE_URL).
test.use({ serviceWorkers: 'allow' });

test.describe('Offline', () => {
  test('after one visit the app loads and works with no connection', async ({ page, context }) => {
    test.slow();
    await openApp(page, standardBudget());
    await expect(page.getByTestId('left-over')).toHaveText('$540');

    // Wait until the service worker is installed and controls the page (clientsClaim).
    const sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      await navigator.serviceWorker.ready;
      return 'ready';
    });
    expect(sw).toBe('ready');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 });

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId('left-over')).toHaveText('$540');
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);

      // Still fully usable: change something offline.
      await goTab(page, 'Bills');
      await page.getByRole('button', { name: 'Add a bill' }).click();
      const s = sheet(page, 'bill-sheet');
      await s.getByLabel('Name').fill('Water');
      await s.getByLabel('Amount').fill('40');
      await s.getByRole('button', { name: 'Add bill' }).click();
      await expect(s).toBeHidden();
      await expectCents(page.getByTestId('bills-total'), 90_000);

      // And it survives another offline reload.
      await page.reload();
      await expect(page.getByTestId('left-over')).toHaveText('$500');
      expect((await stored(page)).bills.map((b) => b.name)).toContain('Water');
    } finally {
      await context.setOffline(false);
    }
  });
});
