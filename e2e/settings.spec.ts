import { readFile } from 'node:fs/promises';
import {
  budget,
  choose,
  dialog,
  expect,
  goTab,
  income,
  openApp,
  openSettings,
  sheet,
  standardBudget,
  stored,
  test,
  TODAY,
  undoButton,
} from './helpers';
import type { BudgetData } from '../src/types';

test.describe.configure({ mode: 'parallel' });

test.describe('Settings', () => {
  test('theme switch sets data-theme and survives a reload', async ({ page }) => {
    await openApp(page, standardBudget());
    await openSettings(page);
    const html = page.locator('html');
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    await expect(html).not.toHaveAttribute('data-theme', /.+/);

    await choose(page, 'Dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await choose(page, 'Light');
    await expect(html).toHaveAttribute('data-theme', 'light');
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).not.toBe(lightBg);

    await choose(page, 'Dark');
    expect((await stored(page)).settings.theme).toBe('dark');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await openSettings(page);
    await choose(page, 'System');
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
  });

  test('load the example budget (with Undo), then clear it', async ({ page }) => {
    const original = standardBudget();
    await openApp(page, original);
    await openSettings(page);
    await page.getByRole('button', { name: 'Load example budget' }).click();
    await expect(dialog(page)).toContainText('Load the example budget?');
    await dialog(page).getByRole('button', { name: 'Load example' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'October' })).toBeVisible();
    await expect(page.getByText("You're looking at example numbers")).toBeVisible();
    expect((await stored(page)).settings.isExample).toBe(true);

    // Undo brings back my own numbers.
    await undoButton(page).click();
    await expect(page.getByText("You're looking at example numbers")).toBeHidden();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    expect(await stored(page)).toEqual(original);

    // Load again and clear it from Settings → back to onboarding.
    await openSettings(page);
    await page.getByRole('button', { name: 'Load example budget' }).click();
    await dialog(page).getByRole('button', { name: 'Load example' }).click();
    await expect(page.getByText("You're looking at example numbers")).toBeVisible();
    await openSettings(page);
    await expect(page.getByText("You're looking at example numbers right now.")).toBeVisible();
    await page.getByRole('button', { name: 'Clear example budget' }).click();
    await dialog(page).getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
    const d = await stored(page);
    expect(d.settings.isExample).toBe(false);
    expect([d.incomes, d.bills, d.debts, d.spending, d.goals]).toEqual([[], [], [], [], []]);
  });

  test('"Start my own budget" on the example banner clears the example', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Just let me look around with example numbers' }).click();
    await page.getByRole('button', { name: 'Start my own budget' }).click();
    await dialog(page).getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
    expect((await stored(page)).incomes).toEqual([]);
  });

  test('backup → restore round trip', async ({ page }) => {
    const original = standardBudget();
    await openApp(page, original);
    await openSettings(page);
    await expect(page.getByText("You haven't made a backup yet.", { exact: false })).toBeVisible();

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Back up my data' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`budget-backup-${TODAY}.json`);
    const path = test.info().outputPath('backup.json');
    await download.saveAs(path);
    const file = JSON.parse(await readFile(path, 'utf8')) as { app: string; version: number; exportedAt: string; data: BudgetData };
    expect(file.app).toBe('budget');
    expect(file.version).toBe(1);
    // The file is the budget as it was, recording itself as the latest backup.
    expect(file.data).toEqual({ ...original, settings: { ...original.settings, lastBackupAt: TODAY } });
    await expect(page.getByRole('status')).toContainText('Backup downloaded');
    await expect(page.getByText('Last backup: Oct 8.', { exact: false })).toBeVisible();

    // Change things: delete a bill and add a paycheck.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await goTab(page, 'Bills');
    await page.getByRole('button', { name: /^Phone,/ }).click();
    await sheet(page, 'bill-sheet').getByRole('button', { name: 'Delete this bill' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('button', { name: /^Phone,/ })).toHaveCount(0);
    expect((await stored(page)).bills).toHaveLength(1);

    // Restore the file: preview what's in it, confirm, and everything is back exactly.
    await goTab(page, 'Home');
    await openSettings(page);
    await page.getByTestId('restore-file-input').setInputFiles(path);
    await expect(dialog(page)).toContainText('Restore this backup?');
    for (const line of ['1 paycheck', '2 bills', '1 debt', '2 spending categories', '1 savings goal']) {
      await expect(dialog(page).getByRole('listitem').filter({ hasText: line })).toBeVisible();
    }
    await dialog(page).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status')).toContainText('Backup restored');
    expect(await stored(page)).toEqual(file.data);
    // Restoring your own backup doesn't forget that you made one.
    await expect(page.getByText('Last backup: Oct 8.', { exact: false })).toBeVisible();
    await page.reload();
    await goTab(page, 'Bills');
    await expect(page.getByRole('button', { name: /^Phone,/ })).toBeVisible();
    expect(await stored(page)).toEqual(file.data);
  });

  test('a file that is not a backup is refused with a friendly message', async ({ page }) => {
    const original = standardBudget();
    await openApp(page, original);
    await openSettings(page);
    await page.getByTestId('restore-file-input').setInputFiles({
      name: 'photo.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello": "world"}'),
    });
    await expect(dialog(page)).toContainText("Couldn't use this file");
    await expect(dialog(page)).toContainText("This file isn't a Budget backup.");
    await dialog(page).getByRole('button', { name: 'OK' }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await stored(page)).toEqual(original);
  });

  test('restoring a backup can be cancelled', async ({ page }) => {
    const original = standardBudget();
    await openApp(page, original);
    await openSettings(page);
    const other = budget({ incomes: [income({ name: 'Other job' })] });
    await page.getByTestId('restore-file-input').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'budget', version: 1, exportedAt: '2026-10-01T12:00:00.000Z', data: other })),
    });
    await expect(dialog(page)).toContainText('Backup from Oct 1, 2026.');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await stored(page)).toEqual(original);
  });

  test('Undo right after a restore brings the old numbers back', async ({ page }) => {
    const original = standardBudget();
    await openApp(page, original);
    await openSettings(page);
    const other = budget({ incomes: [income({ name: 'Other job', amount: 123_400 })] });
    await page.getByTestId('restore-file-input').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'budget', version: 1, exportedAt: '2026-10-01T12:00:00.000Z', data: other })),
    });
    await dialog(page).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status')).toContainText('Backup restored');
    expect(await stored(page)).toEqual(other);
    await undoButton(page).click();
    await expect(page.getByRole('status')).not.toContainText('Backup restored');
    expect(await stored(page)).toEqual(original);
  });

  test('restore a backup from the welcome screen ("I have a backup file")', async ({ page }) => {
    await openApp(page);
    const data = standardBudget();
    await expect(page.getByRole('button', { name: 'I have a backup file' })).toBeVisible();
    await page.getByTestId('restore-file-input').setInputFiles({
      name: 'budget-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'budget', version: 1, exportedAt: '2026-10-01T12:00:00.000Z', data })),
    });
    await expect(dialog(page)).toContainText('Restore this backup?');
    await dialog(page).getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByTestId('left-over')).toHaveText('$540');
    expect(await stored(page)).toEqual(data);
  });

  test('start over needs two confirmations, then shows onboarding', async ({ page }) => {
    await openApp(page, standardBudget());
    await openSettings(page);
    const startOver = page.getByRole('button', { name: 'Start over (erase everything)' });

    // Backing out at the second step keeps everything.
    await startOver.click();
    await expect(dialog(page)).toContainText('Start over?');
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await expect(dialog(page)).toContainText('Are you sure?');
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    expect((await stored(page)).incomes).toHaveLength(1);

    await startOver.click();
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await dialog(page).getByRole('button', { name: 'Erase everything' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Budget' })).toBeVisible();
    const d = await stored(page);
    expect(d.settings.onboarded).toBe(false);
    expect([d.incomes, d.bills, d.debts, d.spending, d.goals]).toEqual([[], [], [], [], []]);
  });

  test('install help and version are shown', async ({ page }) => {
    await openApp(page, standardBudget());
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'How to install on your iPhone' })).toBeVisible();
    await expect(page.getByText('Add to Home Screen')).toBeVisible();
    await expect(page.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
  });
});
