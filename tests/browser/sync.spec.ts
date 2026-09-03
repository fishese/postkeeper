import { importFixture, openSettings } from './ui-helpers';
import { expect, test } from '@playwright/test';

test('encrypted sync setup requires recovery-key confirmation and connection', async ({ page }) => {
  await page.goto('/');
  await openSettings(page, 'Encrypted sync');
  await expect(page.getByTestId('sync-state')).toContainText('Local only');
  await expect(
    page
      .getByText(
        'Google Drive sync is not configured for this build. Your local library is ready to use.',
      )
      .or(page.getByRole('button', { name: 'Load Google sign-in' })),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Create library recovery key' }).click();
  await expect(page.getByTestId('recovery-key')).toHaveValue(/^pk1_[A-Za-z0-9_-]{43}$/u);
  const syncButton = page.getByRole('button', { name: 'Sync now' });
  await expect(syncButton).toBeDisabled();
  await page.getByRole('checkbox', { name: /I saved the recovery key/u }).check();
  await expect(syncButton).toBeDisabled();
});

test('production CSP permits GIS and Drive while the saved reader remains network-isolated', async ({
  page,
}) => {
  let driveRequests = 0;
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.google = { accounts: { oauth2: {
      initTokenClient(config) { return { requestAccessToken() { config.callback({ access_token: 'synthetic-test-token', expires_in: 3600 }); } }; },
      revoke(token, callback) { callback(); }
    } } };`,
    }),
  );
  await page.route('https://www.googleapis.com/**', (route) => {
    driveRequests += 1;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":{"message":"Synthetic expired token"}}',
    });
  });
  await page.goto('/');
  await openSettings(page, 'Encrypted sync');
  test.skip(
    await page
      .getByText(
        'Google Drive sync is not configured for this build. Your local library is ready to use.',
      )
      .isVisible(),
    'OAuth-enabled build required.',
  );
  await page.getByRole('button', { name: 'Load Google sign-in' }).click();
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await expect(page.getByTestId('sync-state')).toContainText('Google Drive connected');
  await page.getByRole('button', { name: 'Create library recovery key' }).click();
  await page.getByRole('checkbox', { name: /I saved the recovery key/u }).check();
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(page.getByTestId('sync-state')).toContainText('Reconnect required');
  expect(driveRequests).toBeGreaterThan(0);
  await importFixture(page, 'Import development fixture');
  const reader = page.getByTestId('reader-frame');
  await expect(reader).toHaveAttribute('sandbox', '');
  await expect(reader).toHaveAttribute('srcdoc', /connect-src 'none'/u);
  await expect(reader).toHaveAttribute('srcdoc', /script-src 'none'/u);
});
