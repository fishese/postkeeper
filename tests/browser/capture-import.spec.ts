import { importFixture } from './ui-helpers';
import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

test('capture packages import with local assets and visible partial warnings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('storage-status')).toContainText(/Storage:/, { timeout: 15_000 });

  await importFixture(page, 'Import public capture package');
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeVisible();
  await expect(
    page
      .frameLocator('[data-testid="reader-frame"]')
      .getByText('This local page represents readable public content.'),
  ).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="reader-frame"]').getByRole('img', { name: 'fixture' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .frameLocator('[data-testid="reader-frame"]')
        .getByRole('img', { name: 'fixture' })
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);

  await importFixture(page, 'Import hostile capture package');
  await expect(page.getByTestId('capture-status')).toContainText('Capture status: Partial capture');
  await expect(page.getByTestId('capture-status')).toContainText(
    'missing-asset:https://fixtures.postkeeper.local/missing.png',
  );
  const reader = page.frameLocator('[data-testid="reader-frame"]');
  await expect(reader.getByText('Unsafe content is present for sanitizer tests.')).toBeVisible();
  await expect(reader.locator('script, form, input, button, iframe, object, embed')).toHaveCount(0);
  await expect(reader.locator('img[src]')).toHaveCount(0);
});
