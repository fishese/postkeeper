import { expect, test } from '@playwright/test';
import { articleDetails, importFixture } from './ui-helpers';

test('text-only reading copy and confirmed deletion survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await importFixture(page, 'Import public capture package');
  await articleDetails(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete article', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A public fixture article', exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove images from reading copy', exact: true }).click();
  await expect(page.frameLocator('[title="Safe reader"]').locator('img')).toHaveCount(0);
  await articleDetails(page);
  await expect(
    page.getByRole('button', { name: 'Remove images from reading copy', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: /A public fixture article/ }).click();
  await expect(page.frameLocator('[title="Safe reader"]').locator('img')).toHaveCount(0);
  await articleDetails(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete article', exact: true }).click();
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toHaveCount(0);
});

test('add sheet exposes extension downloads and instructions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Add link', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Save a link' });
  await expect(sheet.getByRole('link', { name: 'Browser extension setup' })).toHaveAttribute(
    'href',
    '/extensions.html',
  );
  await expect(
    sheet.getByRole('link', { name: 'Chromium extension ZIP', exact: true }),
  ).toHaveAttribute('href', /postkeeper-chromium-0\.1\.3\.zip$/);
  await expect(
    sheet.getByRole('link', { name: 'Firefox extension ZIP (unsigned)', exact: true }),
  ).toHaveAttribute('href', /postkeeper-firefox-0\.1\.3\.zip$/);
});
