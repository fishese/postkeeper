// Opt-in. Targets only the disposable native debug app on an explicitly named emulator.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [endpoint, serial] = process.argv.slice(2);
if (
  !/^http:\/\/127\.0\.0\.1:\d+$/u.test(endpoint ?? '') ||
  !/^emulator-\d+$/u.test(serial ?? '') ||
  !process.argv.includes('--allow-emulator-debugging')
)
  throw new Error(
    'Supply a loopback app endpoint, emulator serial, and --allow-emulator-debugging.',
  );
const adbPath = process.env.POSTKEEPER_ADB;
if (!adbPath) throw new Error('Set POSTKEEPER_ADB to Android SDK adb.');
const adb = (...args) =>
  execFileSync(adbPath, ['-s', serial, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  });
const pkg = 'cc.fishese.postkeeper.debug';
async function tapNative(text) {
  if (text === 'Clear this site' || text === 'Clear all browsing data') {
    await tapNative('Browser options');
  }
  let bounds;
  await expect
    .poll(
      () => {
        adb('shell', 'uiautomator', 'dump', '/data/local/tmp/postkeeper-m6-ui.xml');
        const xml = adb('shell', 'cat', '/data/local/tmp/postkeeper-m6-ui.xml');
        const node = [...xml.matchAll(/<node\b[^>]+/gu)]
          .map((match) => match[0])
          .find(
            (node) =>
              (node.toLowerCase().includes(`text="${text.toLowerCase()}"`) ||
                node.toLowerCase().includes(`content-desc="${text.toLowerCase()}"`)) &&
              node.includes('enabled="true"'),
          );
        bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/u);
        return !!bounds;
      },
      { timeout: 20000, intervals: [500] },
    )
    .toBe(true);
  const [, x1, y1, x2, y2] = bounds.map(Number);
  adb(
    'shell',
    'input',
    'tap',
    String(Math.round((x1 + x2) / 2)),
    String(Math.round((y1 + y2) / 2)),
  );
}
let browser = await chromium.connectOverCDP(endpoint);
let context = browser.contexts()[0];
let main = context
  .pages()
  .find((page) => page.url() === 'https://appassets.androidplatform.net/assets/web/index.html');
assert(main, 'Only the native debug app may be inspected.');
async function share(path, port = 4186) {
  adb(
    'shell',
    'am',
    'start',
    '-n',
    `${pkg}/cc.fishese.postkeeper.MainActivity`,
    '-a',
    'android.intent.action.SEND',
    '-t',
    'text/plain',
    '--es',
    'android.intent.extra.TEXT',
    `http://127.0.0.1:${port}${path}`,
  );
  await expect(
    main.getByText('Link saved to your inbox. Page content has not been captured.'),
  ).toBeVisible();
  await expect(main.getByText('Pending link', { exact: true })).toBeVisible();
}
async function openCapture(expectedUrl) {
  await main.getByRole('button', { name: 'Open capture browser', exact: true }).click();
  // WebView profile selection replaces its initial DevTools target/session. Reattach once the
  // app endpoint advertises the committed fixture URL rather than using the stale blank session.
  await expect
    .poll(
      async () => {
        const targets = await (await fetch(endpoint + '/json/list')).json();
        return targets.some((target) => target.url === expectedUrl);
      },
      { timeout: 20000 },
    )
    .toBe(true);
  await browser.close();
  browser = await chromium.connectOverCDP(endpoint);
  context = browser.contexts()[0];
  main = context
    .pages()
    .find((page) => page.url() === 'https://appassets.androidplatform.net/assets/web/index.html');
  return context.pages().find((page) => page.url() === expectedUrl);
}
async function checkReader(title) {
  await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(
    main.frameLocator('[title="Safe reader"]').getByText('Final native fixture sentence.'),
  ).toBeVisible();
  await expect
    .poll(() =>
      main
        .frameLocator('[title="Safe reader"]')
        .locator('img')
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(main.locator('[title="Safe reader"]')).toHaveAttribute('sandbox', '');
  await expect(main.getByText('Pending link', { exact: true })).toHaveCount(0);
}
async function openLibraryItem(name) {
  const back = main.getByRole('button', { name: 'Back to library', exact: true });
  if (await back.isVisible()) await back.click();
  await main.getByRole('button', { name }).click();
}
try {
  await expect(main.getByRole('heading', { name: 'PostKeeper', exact: true })).toBeVisible();
  await share('/public');
  const publicPage = await openCapture('http://127.0.0.1:4186/public');
  await expect(publicPage.getByRole('heading', { name: 'M6 public article' })).toBeVisible();
  assert.deepEqual(
    await publicPage.evaluate(() => ({
      native: typeof window.PostKeeperNative,
      java: typeof window.Android,
    })),
    { native: 'undefined', java: 'undefined' },
  );
  await publicPage.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.src = 'https://appassets.androidplatform.net/assets/web/index.html';
    document.body.append(frame);
  });
  await expect.poll(() => publicPage.frames().length).toBe(2);
  assert.equal(
    await publicPage.frames()[1].evaluate(() => typeof window.PostKeeperNative),
    'undefined',
  );
  await tapNative('Save page');
  await checkReader('M6 public article');
  console.log(
    'PASS: native ACTION_SEND, pending item, public capture, decoded image, absent website/frame native bridges.',
  );

  await share('/private');
  const authPage = await openCapture('http://127.0.0.1:4186/private');
  await expect(authPage.getByRole('heading', { name: 'Fixture sign-in' })).toBeVisible();
  await authPage.getByRole('button', { name: 'Sign in to fixture' }).click();
  await expect(authPage.getByRole('heading', { name: 'M6 authenticated article' })).toBeVisible();
  await tapNative('Save page');
  await checkReader('M6 authenticated article');
  const preserved = await main.getByTestId('article-list').locator('li').count();
  // Read only this disposable app's stored records/blobs; do not print contents.
  const credentialAudit = await main.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open('postkeeper');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction(['snapshots', 'articles', 'blobBytes']);
    const values = await Promise.all(
      ['snapshots', 'articles', 'blobBytes'].map(
        (name) =>
          new Promise((resolve) => {
            const r = tx.objectStore(name).getAll();
            r.onsuccess = () => resolve(r.result);
          }),
      ),
    );
    db.close();
    let text = JSON.stringify(values);
    const root = await navigator.storage.getDirectory();
    async function read(dir) {
      for await (const entry of dir.values()) {
        if (entry.kind === 'directory') await read(entry);
        else text += await (await entry.getFile()).text();
      }
    }
    await read(root);
    return ![
      'TEST_PASSWORD_DO_NOT_CAPTURE',
      'TEST_CSRF_DO_NOT_CAPTURE',
      'm6-auth=fixture-only',
    ].some((secret) => text.includes(secret));
  });
  assert(credentialAudit);
  console.log(
    'PASS: authenticated page and authenticated image capture; fixture credentials absent from stored metadata/raw DOM/blobs.',
  );

  const reopen = await openCapture('http://127.0.0.1:4186/private');
  await expect(reopen.getByRole('heading', { name: 'M6 authenticated article' })).toBeVisible();
  await tapNative('Clear this site');
  await tapNative('Clear');
  await expect(reopen.getByRole('heading', { name: 'Fixture sign-in' })).toBeVisible();
  assert.equal(await reopen.evaluate(() => localStorage.getItem('m6-site')), null);
  await reopen.getByRole('button', { name: 'Sign in to fixture' }).click();
  await expect(reopen.getByRole('heading', { name: 'M6 authenticated article' })).toBeVisible();
  await tapNative('Library');
  await expect(main.getByTestId('article-list').locator('li')).toHaveCount(preserved);
  await checkReader('M6 authenticated article');
  console.log(
    'PASS: site-session clearing removes HttpOnly authentication and local storage while preserving saved articles/images.',
  );

  await share('/private', 4187);
  const second = await openCapture('http://127.0.0.1:4187/private');
  await second.getByRole('button', { name: 'Sign in to fixture' }).click();
  await expect(second.getByRole('heading', { name: 'M6 authenticated article' })).toBeVisible();
  await tapNative('Clear all browsing data');
  await tapNative('Clear');
  await expect(second.getByRole('heading', { name: 'Fixture sign-in' })).toBeVisible();
  await tapNative('Library');
  await expect(main.getByTestId('article-list').locator('li')).toHaveCount(preserved + 1);
  await openLibraryItem(/M6 authenticated article/);
  const firstAfterAll = await openCapture('http://127.0.0.1:4186/private');
  await expect(firstAfterAll.getByRole('heading', { name: 'Fixture sign-in' })).toBeVisible();
  assert.equal(await firstAfterAll.evaluate(() => localStorage.getItem('m6-site')), null);
  await tapNative('Library');
  console.log('PASS: clear-all browsing data preserves the independent native library.');
  // Test origin guards on the normal opaque-origin saved reader.
  await openLibraryItem(/M6 public article/);
  assert.equal(
    await main
      .frameLocator('[title="Safe reader"]')
      .locator('body')
      .evaluate(() => typeof window.PostKeeperNative),
    'undefined',
  );
  await main.reload();
  await openLibraryItem(/M6 authenticated article/);
  await checkReader('M6 authenticated article');
  console.log(
    JSON.stringify({
      browser: browser.version(),
      nativeShare: true,
      publicCapture: true,
      authenticatedCapture: true,
      siteClear: true,
      allClear: true,
      libraryReload: true,
      credentialAudit: true,
      phoneUsed: false,
    }),
  );
} finally {
  await browser.close();
  adb('shell', 'rm', '-f', '/data/local/tmp/postkeeper-m6-ui.xml');
}
