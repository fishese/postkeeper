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
  await policy.close();
});
