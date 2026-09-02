import { expect, test } from '@playwright/test';

test('PWA shell runs storage and bounded-transfer probes', async ({ page }) => {
  await page.goto('/#feasibility');
  await expect(page.getByRole('heading', { name: 'PostKeeper' })).toBeVisible();
  await page.getByRole('button', { name: 'Run storage probe' }).click();
  await expect(page.getByTestId('storage-result')).toContainText('passed');
  await page.getByRole('button', { name: 'Run transfer probe' }).click();
  await expect(page.getByTestId('transfer-result')).toContainText('passed');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
});
