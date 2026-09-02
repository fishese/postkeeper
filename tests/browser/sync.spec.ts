import { expect, test } from '@playwright/test';

test('encrypted sync setup requires recovery-key confirmation and connection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sync-state')).toContainText('local');
  await expect(
    page
      .getByText('This build has no Google OAuth client ID')
      .or(page.getByRole('button', { name: 'Load Google sign-in' })),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Create library recovery key' }).click();
  await expect(page.getByTestId('recovery-key')).toHaveValue(/^pk1_[A-Za-z0-9_-]{43}$/u);
  const syncButton = page.getByRole('button', { name: 'Sync now' });
  await expect(syncButton).toBeDisabled();
  await page.getByRole('checkbox', { name: /I saved the recovery key/u }).check();
  await expect(syncButton).toBeDisabled();
});
