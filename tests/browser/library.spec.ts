import { expect, test } from '@playwright/test';

test.describe.configure({ timeout: 60_000 });

test('library add, organize, restart, search, and read workflows', async ({ context, page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PostKeeper' })).toBeVisible();
  await expect(page.getByTestId('storage-status')).toContainText(/Storage:/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Import development fixture' }).click();
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeVisible();
  await page.getByRole('button', { name: /A public fixture article/ }).click();

  await page.getByLabel('New category').fill('Field notes');
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('button', { name: 'Field notes' })).toBeVisible();
  const membership = page.getByRole('checkbox', { name: 'Field notes' });
  await membership.click();
  await expect(membership).toBeChecked();
  await page.getByRole('button', { name: 'Inbox' }).click();
  await expect(page.getByText('No articles in this view.')).toBeVisible();
  await page.getByRole('button', { name: 'Field notes' }).click();
  await page.getByRole('button', { name: /A public fixture article/ }).click();
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  await page.getByRole('button', { name: 'Mark read' }).click();

  await page.getByRole('searchbox', { name: 'Search library' }).fill('alpine marmot');
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeVisible();
  await page.getByRole('button', { name: 'Rebuild search index' }).click();
  await expect(page.getByTestId('rebuild-status')).toContainText('Rebuilt');

  await page.reload();
  await expect(page.getByTestId('storage-status')).toContainText(/Storage:/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeVisible();
  await page.getByRole('button', { name: /A public fixture article/ }).click();

  const reader = page.frameLocator('[data-testid="reader-frame"]');
  await expect(reader.getByRole('heading', { name: 'A public fixture article' })).toBeVisible();
  await expect(reader.getByRole('img', { name: 'fixture' })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('storage-status')).toContainText(/Storage:/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await page.getByRole('button', { name: /A public fixture article/ }).click();
  await expect(
    page.frameLocator('[data-testid="reader-frame"]').getByRole('heading', {
      name: 'A public fixture article',
    }),
  ).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="reader-frame"]').getByRole('img', { name: 'fixture' }),
  ).toBeVisible();
});

test('library releases its database connection when the UI unmounts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('storage-status')).toContainText(/Storage:/, { timeout: 15_000 });

  await page.evaluate(() => {
    window.location.hash = '#feasibility';
  });
  await expect(page.getByRole('heading', { name: 'Storage feasibility' })).toBeVisible();

  const deletion = await page.evaluate(
    () =>
      new Promise<'deleted' | 'blocked' | 'error'>((resolve) => {
        const request = indexedDB.deleteDatabase('postkeeper');
        request.onsuccess = () => resolve('deleted');
        request.onblocked = () => resolve('blocked');
        request.onerror = () => resolve('error');
      }),
  );
  expect(deletion).toBe('deleted');
});
