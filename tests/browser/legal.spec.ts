import { expect, test } from '@playwright/test';
import { openSettings } from './ui-helpers';

test.describe('static policy pages without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const [path, title] of [
    ['privacy.html', 'Privacy Policy'],
    ['terms.html', 'Terms of Service'],
  ]) {
    test(`${path} is served as a real public document`, async ({ page, request }) => {
      const response = await request.get(`/${path}`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<title>${title} · PostKeeper</title>`);
      expect(html).not.toContain('<script');
      await page.goto(`/${path}`);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'PostKeeper issue tracker', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open app', exact: true })).toHaveAttribute(
        'href',
        './',
      );
    });
  }
});

test.describe('extension installation page without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('serves versioned downloads and accurate platform guidance', async ({ page, request }) => {
    const response = await request.get('/extensions.html');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>Browser extension · PostKeeper</title>');
    expect(html).not.toContain('<script');

    await page.goto('/extensions.html');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Install the browser extension', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download Chromium ZIP' })).toHaveAttribute(
      'href',
      'https://github.com/fishese/postkeeper/releases/download/extension-v0.1.2/postkeeper-chromium-0.1.2.zip',
    );
    await expect(page.getByRole('link', { name: 'Download Firefox ZIP' })).toHaveAttribute(
      'href',
      'https://github.com/fishese/postkeeper/releases/download/extension-v0.1.2/postkeeper-firefox-0.1.2.zip',
    );
    await expect(page.getByText('cannot send directly into the APK')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test('policy links preserve the app session and the PWA serves policy pages offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await openSettings(page, 'About PostKeeper');
  const extensionLink = page.getByRole('link', { name: 'Browser extension setup', exact: true });
  await expect(extensionLink).toHaveAttribute('target', '_blank');
  const extensionOpened = page.waitForEvent('popup');
  await extensionLink.click();
  const extensionGuide = await extensionOpened;
  await expect(
    extensionGuide.getByRole('heading', { name: 'Install the browser extension', exact: true }),
  ).toBeVisible();
  await extensionGuide.close();
  const policyLink = page.getByRole('link', { name: 'Privacy Policy', exact: true }).first();
  await expect(policyLink).toHaveAttribute('target', '_blank');
  const opened = page.waitForEvent('popup');
  await policyLink.click();
  const policy = await opened;
  await expect(policy.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await policy.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(
    policy.getByRole('heading', { name: 'Terms of Service', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await policy.reload();
  await expect(
    policy.getByRole('heading', { name: 'Terms of Service', exact: true }),
  ).toBeVisible();
  await policy.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(policy.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
  await policy.getByRole('link', { name: 'Extensions', exact: true }).click();
  await expect(
    policy.getByRole('heading', { name: 'Install the browser extension', exact: true }),
  ).toBeVisible();
  await policy.close();
});
