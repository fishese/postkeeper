// Opt-in, emulator-only fixture acceptance. Never accesses Drive or recovery inputs.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const endpoint = process.argv[2];
if (
  !/^http:\/\/127\.0\.0\.1:\d+$/u.test(endpoint ?? '') ||
  !process.argv.includes('--allow-emulator-debugging')
) {
  throw new Error('Supply the approved loopback emulator endpoint and --allow-emulator-debugging.');
}
const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
const production = context.pages().find((page) => page.url() === 'https://keep.fishese.cc/');
assert(production, 'Preserved production PostKeeper tab must remain open.');
const namespace = `postkeeper-m5-disposable-${crypto.randomUUID()}`;
let page;
let preview;
let leaveOpen = false;
async function fingerprint() {
  return production.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === 'postkeeper'))
      throw new Error('Existing library missing');
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('postkeeper');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(new Error('Database unavailable'));
    });
    try {
      const names = [...db.objectStoreNames];
      const tx = db.transaction(names);
      const records = await Promise.all(
        names.map(
          (name) =>
            new Promise((resolve, reject) => {
              const r = tx.objectStore(name).getAll();
              r.onsuccess = () => resolve([name, r.result]);
              r.onerror = () => reject(new Error('Read failed'));
            }),
        ),
      );
      const hash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(records)),
      );
      return [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, '0')).join('');
    } finally {
      db.close();
    }
  });
}
const before = await fingerprint();
if (process.argv.includes('--cleanup-fixtures')) {
  const cleanup = await context.newPage();
  try {
    await cleanup.goto('http://127.0.0.1:4173/#feasibility');
    await expect(cleanup.getByRole('heading', { name: 'Storage feasibility' })).toBeVisible();
    const removed = await cleanup.evaluate(async () => {
      const names = (await indexedDB.databases())
        .map((db) => db.name)
        .filter((name) => /^postkeeper-m5-disposable-[a-f0-9-]{36}$/u.test(name ?? ''));
      for (const name of names)
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = resolve;
          request.onerror = () => reject(new Error('Fixture cleanup failed'));
          request.onblocked = () => reject(new Error('Close fixture tabs before cleanup'));
        });
      return names.length;
    });
    console.log({ removedDisposableDatabases: removed });
    assert.equal(await fingerprint(), before);
  } finally {
    await cleanup.close();
    await browser.close();
  }
  process.exit(0);
}
try {
  page = await context.newPage();
  // A unique IndexedDB namespace on a localhost fixture tab; never applied to production.
  await page.addInitScript(
    ({ namespace }) => {
      window.__postkeeperFixtureNamespace = namespace;
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, version) => open(name === 'postkeeper' ? namespace : name, version);
      // Capture only this disposable page's user-requested Blob downloads, in memory.
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob && blob.type === 'application/json')
          window.__fixtureDownload = blob.text();
        return create(blob);
      };
      HTMLAnchorElement.prototype.click = function () {
        /* Android download manager is checked separately. */
      };
    },
    { namespace },
  );
  await page.goto('http://127.0.0.1:4173/');
  // Discard only this localhost test origin's cached app shell, never production storage.
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister();
  });
  await page.goto('about:blank');
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('heading', { name: 'Backup and diagnostics' })).toBeVisible();
  await page.getByRole('button', { name: 'Import long print fixture' }).click();
  await expect(
    page.getByRole('heading', { name: 'A long printable fixture', exact: true }),
  ).toBeVisible();
  await page.getByLabel('New category').fill('Emulator backup fixture');
  await page.getByRole('button', { name: 'Create category' }).click();
  await page.getByRole('checkbox', { name: 'Emulator backup fixture' }).click();
  await expect(page.getByRole('checkbox', { name: 'Emulator backup fixture' })).toBeChecked();
  await page.getByRole('button', { name: 'Copy original URL' }).click();
  await expect(page.getByText(/Original URL copied\.|Clipboard unavailable/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open original URL' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  await page.getByLabel('I choose a plaintext backup containing my saved content.').check();
  await page.getByRole('button', { name: 'Export portable backup' }).click();
  await expect(page.getByText(/Backup ready/)).toBeVisible();
  const file = await page.evaluate(() => window.__fixtureDownload);
  assert.equal(JSON.parse(file).payload.articles.length, 1);
  await page.getByLabel('Choose PostKeeper backup').setInputFiles({
    name: 'fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  });
  await expect(page.getByText(/Validated backup: 1 articles/)).toBeVisible();
  await page.getByRole('button', { name: 'Import validated backup' }).click();
  await expect(page.getByText(/Backup imported\./)).toBeVisible();
  await page.getByLabel('Choose PostKeeper backup').setInputFiles({
    name: 'corrupt-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file.slice(0, -9)),
  });
  await expect(page.getByText(/The operation failed/)).toBeVisible();
  await page.getByRole('button', { name: 'Export portable backup' }).click();
  await expect(page.getByText(/Backup ready/)).toBeVisible();
  assert.deepEqual(
    JSON.parse(await page.evaluate(() => window.__fixtureDownload)).payload,
    JSON.parse(file).payload,
  );
  await page.getByRole('button', { name: 'Review local diagnostics' }).click();
  const diagnostics = await page.locator('.diagnostics-preview').innerText();
  assert(!diagnostics.includes('Emulator backup fixture'));
  assert(!diagnostics.includes('fixtures.postkeeper.local'));
  await expect
    .poll(() =>
      page
        .frameLocator('[title="Safe reader"]')
        .locator('img')
        .evaluate((img) => img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.locator('[title="Print window launcher"]')).toHaveCount(1);
  const opened = context.waitForEvent('page', { timeout: 8000 });
  void opened.catch(() => undefined);
  // Android's native modal can suspend the click or later page inspection.
  // Preserve both tabs before dispatching it, including on assertion failure.
  leaveOpen = process.argv.includes('--leave-print-preview');
  await page.getByRole('button', { name: 'Print / Save as PDF' }).click();
  try {
    preview = await opened;
  } catch {
    console.log('Print action status:', await page.locator('.sharing-actions').innerText());
    throw new Error('Emulator print window did not open');
  }
  await expect(preview.getByRole('heading', { name: 'Final section' })).toBeVisible();
  await expect
    .poll(() => preview.locator('img').evaluate((img) => img.naturalWidth > 0))
    .toBe(true);
  assert(await preview.evaluate(() => window.opener === null));
  console.log(
    JSON.stringify({
      browser: browser.version(),
      backupRoundTrip: true,
      corruptRejected: true,
      redaction: true,
      printPreview: true,
      imageDecoded: true,
      productionUnchanged: (await fingerprint()) === before,
    }),
  );
  if (process.argv.includes('--leave-print-preview')) {
    console.log(
      'Disposable print tab left open for native print inspection. Run cleanup afterward.',
    );
    leaveOpen = true;
  }
} finally {
  if (!leaveOpen) await preview?.close();
  if (page && !leaveOpen) {
    await page.goto('http://127.0.0.1:4173/#feasibility');
    await expect(page.getByRole('heading', { name: 'Storage feasibility' })).toBeVisible();
    await page.evaluate(
      (name) =>
        new Promise((resolve, reject) => {
          const r = indexedDB.deleteDatabase(name);
          r.onsuccess = () => resolve();
          r.onerror = () => reject(new Error('Fixture cleanup failed'));
          r.onblocked = () => reject(new Error('Fixture cleanup blocked'));
        }),
      namespace,
    );
    await page.close();
  }
  assert.equal(await fingerprint(), before, 'Production library records must be unchanged');
  // connectOverCDP disconnects from the existing browser; it must never shut down the emulator.
  await browser.close();
}
