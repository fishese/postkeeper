import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  articleDetails,
  createCategory,
  importFixture,
  openSettings,
  closeSettings,
} from './ui-helpers';

for (const width of [320, 390]) {
  test(`compact ${width}px library, reader, modal focus, and offline organization`, async ({
    page,
    context,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create library recovery key' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Import development fixture' }),
    ).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage categories' })).toBeVisible();
    expect((await page.getByRole('searchbox').boundingBox())!.y).toBeLessThan(240);
    await importFixture(page, 'Import public capture package');
    await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
    await expect(page.getByRole('searchbox')).not.toBeVisible();
    await expect(page.getByTestId('reader-frame')).toHaveAttribute('sandbox', '');
    await page.getByRole('button', { name: 'Favorite', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unfavorite', exact: true })).toBeVisible();
    await articleDetails(page);
    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeFocused();
    await createCategory(page, 'Reading notes — 藏书');
    await page.getByRole('button', { name: /A public fixture article/ }).click();
    await articleDetails(page);
    await page.getByRole('checkbox', { name: 'Reading notes — 藏书' }).click();
    await expect(page.getByRole('checkbox', { name: 'Reading notes — 藏书' })).toBeChecked();
    await page.getByRole('button', { name: 'Back to library' }).click();
    await page.getByRole('button', { name: 'All items', exact: true }).click();

    // Dialogs retain mounted sync/key state, trap focus, close with Escape and restore the trigger.
    const settings = await openSettings(page, 'Backup and diagnostics');
    await expect(settings.getByRole('button', { name: 'Export portable backup' })).toBeDisabled();
    await page.keyboard.press('Tab');
    expect(await settings.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(settings).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
    await openSettings(page, 'About PostKeeper');
    await expect(page.getByRole('link', { name: 'Download for Android' })).toHaveAttribute(
      'href',
      'https://github.com/fishese/postkeeper/releases/download/v0.6.2/postkeeper-release.apk',
    );
    await closeSettings(page);

    // Logical sizing must reflow at enlarged text and in a future RTL layout.
    for (const dir of ['ltr', 'rtl']) {
      await page.evaluate((direction) => {
        document.documentElement.dir = direction;
        document.documentElement.style.fontSize = '150%';
      }, dir);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport();
    }
    await page.evaluate(() => {
      document.documentElement.dir = 'ltr';
      document.documentElement.style.fontSize = '';
    });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(page.getByRole('button', { name: /A public fixture article/ })).toBeVisible();
    if (browserName === 'chromium' && width === 390) {
      await mkdir('apps/web/dist-ui-review', { recursive: true });
      await page.screenshot({ path: 'apps/web/dist-ui-review/mobile-library.png' });
    }
    await page.getByRole('button', { name: /A public fixture article/ }).click();
    await expect
      .poll(() =>
        page
          .frameLocator('[title="Safe reader"]')
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    if (browserName === 'chromium' && width === 390)
      await page.screenshot({ path: 'apps/web/dist-ui-review/mobile-reader.png' });
  });
}

test('add-link validation remains visible inside the sheet and desktop reading keeps the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add link', exact: true }).first().click();
  await page.getByLabel('Page URL', { exact: true }).fill('https://user:password@example.com/');
  await page.getByRole('button', { name: 'Save link to inbox' }).click();
  await expect(page.getByRole('dialog', { name: 'Save a link' }).getByRole('status')).toBeVisible();
  await expect(page.getByTestId('article-list').locator('li')).toHaveCount(0);
  await page
    .getByRole('dialog', { name: 'Save a link' })
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('status').getByRole('button', { name: 'Close' }).click();
  await importFixture(page, 'Import development fixture');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await expect(page.getByTestId('reader-frame')).toBeVisible();
  await mkdir('apps/web/dist-ui-review', { recursive: true });
  await page.screenshot({ path: 'apps/web/dist-ui-review/desktop-library.png' });
});
