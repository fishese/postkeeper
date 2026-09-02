import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

test('capture packages import with local assets and visible partial warnings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('storage-status')).toContainText(/Storage:/, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Import public capture package' }).click();
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeVisible();
  await expect(
    page
      .frameLocator('[data-testid="reader-frame"]')
      .getByText('This local page represents readable public content.'),
  ).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="reader-frame"]').getByRole('img', { name: 'fixture' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Import hostile capture package' }).click();
  await expect(page.getByTestId('capture-status')).toContainText('Capture status: partial');
  await expect(page.getByTestId('capture-status')).toContainText(
    'missing-asset:https://fixtures.postkeeper.local/missing.png',
  );
  const reader = page.frameLocator('[data-testid="reader-frame"]');
  await expect(reader.getByText('Unsafe content is present for sanitizer tests.')).toBeVisible();
  await expect(reader.locator('script, form, input, button, iframe, object, embed')).toHaveCount(0);
  await expect(reader.locator('img[src]')).toHaveCount(0);
});
