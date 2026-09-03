import { expect, test } from '@playwright/test';

test('shared POST is handled locally and pending links survive offline reload', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Installed Web Share Target acceptance is Chromium-only; manual and fragment receipt are covered in both browsers.',
  );
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  let sentToNetwork = false;
  await context.route('**/share-target', (route) => {
    sentToNetwork = true;
    return route.abort();
  });
  expect(
    await page.evaluate(async () => {
      const body = new FormData();
      body.set('text', 'x'.repeat(33000));
      return (await fetch('share-target', { method: 'POST', body })).status;
    }),
  ).toBe(400);
  await expect(page.getByTestId('article-list').locator('li')).toHaveCount(0);
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.action = 'share-target';
    form.method = 'post';
    form.enctype = 'multipart/form-data';
    for (const [name, value] of Object.entries({
      title: 'Shared field notes',
      text: 'https://example.com/notes?personal=local-only',
    })) {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  });
  await expect(
    page.getByText('Link saved to your inbox. Page content has not been captured.'),
  ).toBeVisible();
  expect(sentToNetwork).toBe(false);
  expect(page.url()).not.toContain('personal');
  await expect(page.getByText('Pending link', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Shared field notes/ }).click();
  await expect(page.getByText('Pending link', { exact: true })).toBeVisible();
  await expect(
    page.frameLocator('[title="Safe reader"]').getByText(/Only the link is saved/),
  ).toBeVisible();
  await expect(page.locator('[title="Safe reader"]')).toHaveAttribute('sandbox', '');
});

test('invalid fragment share leaves the library usable and empty', async ({ page }) => {
  await page.goto('/#share=' + encodeURIComponent(JSON.stringify({ url: 'javascript:alert(1)' })));
  await expect(page.getByTestId('article-list').locator('li')).toHaveCount(0);
  await page.getByLabel('Page URL', { exact: true }).fill('https://example.com/safe');
  await page.getByRole('button', { name: 'Save link to inbox' }).click();
  await expect(page.getByTestId('article-list').locator('li')).toHaveCount(1);
});
