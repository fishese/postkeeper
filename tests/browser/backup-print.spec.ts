import { importFixture, createCategory, articleDetails, openSettings } from './ui-helpers';
import { expect, test, type Download, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const parts: Buffer[] = [];
  for await (const part of stream!) parts.push(Buffer.from(part));
  return Buffer.concat(parts).toString('utf8');
}
async function backup(page: Page) {
  await openSettings(page, 'Backup and diagnostics');
  await page.getByLabel('I choose a plaintext backup containing my saved content.').check();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export portable backup' }).click();
  return downloadText(await downloaded);
}
async function upload(page: Page, text: string) {
  await openSettings(page, 'Backup and diagnostics');
  await page.getByLabel('Choose PostKeeper backup').setInputFiles({
    name: 'fixture-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

test('portable backup downloads, stages, cancels, restores offline, and rejects corruption', async ({
  browser,
  page,
}) => {
  await page.goto('/');
  await importFixture(page, 'Import public capture package');
  await expect(
    page.getByRole('heading', { name: 'A public fixture article', exact: true }),
  ).toBeVisible();
  await createCategory(page, 'Backup field notes');
  await articleDetails(page);
  await page.getByRole('checkbox', { name: 'Backup field notes' }).click();
  await expect(page.getByRole('checkbox', { name: 'Backup field notes' })).toBeChecked();
  await page.getByRole('button', { name: 'Favorite', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite', exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('oauth-token', 'PRIVATE_OAUTH_TEST_VALUE');
    sessionStorage.setItem('recovery-key', 'PRIVATE_RECOVERY_TEST_VALUE');
    document.cookie = 'website-session=PRIVATE_SESSION_TEST_VALUE';
  });
  const text = await backup(page);
  expect(text).not.toContain('PRIVATE_');
  const context = await browser.newContext();
  try {
    const target = await context.newPage();
    await target.goto('http://127.0.0.1:4173/');
    await upload(target, text);
    await expect(target.getByText(/Validated backup: 1 articles/)).toBeVisible();
    await expect(target.getByTestId('article-list').locator('li')).toHaveCount(0);
    await target.getByRole('button', { name: 'Cancel import' }).click();
    await expect(target.getByRole('button', { name: 'Import validated backup' })).toHaveCount(0);
    await upload(target, text);
    await target.getByRole('button', { name: 'Import validated backup' }).click();
    await expect(target.getByText(/Backup imported\./)).toBeVisible();
    expect(JSON.parse(await backup(target)).payload).toEqual(JSON.parse(text).payload);
    await upload(target, text.slice(0, -10));
    await expect(target.getByText(/The operation failed/)).toBeVisible();
    expect(JSON.parse(await backup(target)).payload).toEqual(JSON.parse(text).payload);
    await target.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await target.reload();
    await context.setOffline(true);
    await target.reload();
    await target.getByRole('button', { name: 'Favorites', exact: true }).click();
    await target.getByRole('button', { name: /A public fixture article/ }).click();
    await expect
      .poll(() =>
        target
          .frameLocator('[title="Safe reader"]')
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    await articleDetails(target);
    await expect(target.getByRole('checkbox', { name: 'Backup field notes' })).toBeChecked();
    await target.getByRole('searchbox').fill('public content');
    await expect(target.getByTestId('article-list').locator('li')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('original links, clipboard feedback, and deliberately reviewed redacted diagnostics', async ({
  page,
  browserName,
  context,
}) => {
  await page.goto('/');
  await importFixture(page, 'Import development fixture');
  await expect(page.getByRole('link', { name: 'Open original URL' })).toHaveAttribute(
    'href',
    'https://fixtures.postkeeper.local/public-article',
  );
  await expect(page.getByRole('link', { name: 'Open original URL' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  if (browserName === 'chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy original URL' }).click();
  await expect(page.getByText(/Original URL copied\.|Clipboard unavailable/)).toBeVisible();
  if (browserName === 'chromium')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://fixtures.postkeeper.local/public-article',
    );
  await openSettings(page, 'Backup and diagnostics');
  await page.getByRole('button', { name: 'Review local diagnostics' }).click();
  const reviewed = await page.locator('.diagnostics-preview').innerText();
  expect(reviewed).not.toContain('fixtures.postkeeper');
  expect(reviewed).not.toContain('A public fixture article');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export redacted diagnostics' }).click();
  expect(await downloadText(await downloaded)).toBe(reviewed);
});

test('long offline print preview preserves headings, links, decoded images, and script isolation', async ({
  page,
  browserName,
  context,
}) => {
  await page.goto('/');
  await importFixture(page, 'Import long print fixture');
  await expect(
    page.getByRole('heading', { name: 'A long printable fixture', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Print / Save as PDF', exact: true }).click();
  const preview = await opened;
  const sandboxMessages: string[] = [];
  preview.on('console', (message) => {
    if (/sandbox/iu.test(message.text())) sandboxMessages.push(message.text());
  });
  await expect(preview.getByRole('heading', { name: 'Final section' })).toBeVisible();
  await expect
    .poll(() => preview.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth > 0))
    .toBe(true);
  await expect(preview.getByRole('link', { name: 'An external reference' })).toHaveAttribute(
    'href',
    'https://example.com',
  );
  await expect(page.locator('[title="Safe reader"]')).toHaveAttribute('sandbox', '');
  await expect(preview.locator('script,form,input,object,iframe')).toHaveCount(0);
  expect(await preview.evaluate(() => window.opener === null)).toBe(true);
  expect(
    await preview
      .locator('h2')
      .first()
      .evaluate((el) => getComputedStyle(el).breakAfter),
  ).toBe('avoid');
  expect(
    await preview.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'document.body.dataset.unsafe = "executed"';
      document.body.append(script);
      return document.body.dataset.unsafe ?? null;
    }),
  ).toBeNull();
  if (browserName === 'chromium') {
    await expect
      .poll(() => sandboxMessages.some((message) => /allow-scripts/u.test(message)))
      .toBe(true);
    await mkdir('test-results/milestone5', { recursive: true });
    await preview.pdf({
      path: 'test-results/milestone5/long-print.pdf',
      format: 'A4',
      printBackground: true,
    });
  }
  await preview.close();
});
