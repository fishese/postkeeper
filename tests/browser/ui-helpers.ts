import { expect, type Page } from '@playwright/test';

export async function openSettings(page: Page, section: string) {
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  if (!(await dialog.isVisible()))
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const group = dialog
    .locator('details.settings-group')
    .filter({ has: page.locator('summary').filter({ hasText: section }) });
  if (!(await group.evaluate((node: HTMLDetailsElement) => node.open)))
    await group.locator(':scope > summary').click();
  return dialog;
}
export async function closeSettings(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  if (await dialog.isVisible())
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}
export async function importFixture(page: Page, name: string) {
  await openSettings(page, 'Developer tools');
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).not.toBeVisible();
}
export async function createCategory(page: Page, name: string) {
  await page.getByRole('button', { name: 'Manage categories', exact: true }).click();
  await page.getByLabel('New category').fill(name);
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Categories', exact: true })).not.toBeVisible();
}
export async function articleDetails(page: Page) {
  const details = page.locator('.article-details');
  if (!(await details.evaluate((node: HTMLDetailsElement) => node.open)))
    await details.locator('summary').click();
}
