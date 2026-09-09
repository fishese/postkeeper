// Opt-in, additive fixture testing; never clears libraries, profiles, or keys.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [endpoint, serial, realUrl] = process.argv.slice(2);
if (
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint ?? '') ||
  !/^emulator-\d+$/.test(serial ?? '') ||
  !process.argv.includes('--allow-emulator-debugging')
)
  throw new Error('Explicit emulator and loopback endpoint required.');
const adbPath = process.env.POSTKEEPER_ADB;
if (!adbPath) throw new Error('Set POSTKEEPER_ADB.');
const adb = (...args) =>
  execFileSync(adbPath, ['-s', serial, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  });
const pkg = 'cc.fishese.postkeeper.debug';
let browser;
let main;
async function attach() {
  await browser?.close();
  browser = await chromium.connectOverCDP(endpoint);
  main = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url() === 'https://appassets.androidplatform.net/assets/web/index.html');
  assert(main);
}
async function tap(text) {
  let bounds;
  await expect
    .poll(
      () => {
        adb('shell', 'uiautomator', 'dump', '/data/local/tmp/postkeeper-followup-ui.xml');
        const xml = adb('shell', 'cat', '/data/local/tmp/postkeeper-followup-ui.xml');
        const node = [...xml.matchAll(/<node\b[^>]+/g)]
          .map((m) => m[0])
          .find(
            (n) =>
              (n.includes(`text="${text}"`) || n.includes(`content-desc="${text}"`)) &&
              n.includes('enabled="true"'),
          );
        bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        return !!bounds;
      },
      { timeout: 20000 },
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
const servers = [];
const receivedCookies = [];
const suffix = Date.now();
const localUrl = `http://127.0.0.1:4188/article-${suffix}`;
try {
  if (!realUrl || realUrl.startsWith('--')) {
    for (const port of [4188, 4189]) {
      const server = createServer((req, res) => {
        if (req.url.startsWith('/redirect')) {
          res.writeHead(302, { Location: 'http://127.0.0.1:4189/image.svg' });
          res.end();
          return;
        }
        if (req.url.startsWith('/image')) {
          receivedCookies.push(req.headers.cookie ?? '');
          res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
          res.end(
            '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="seagreen"/></svg>',
          );
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Set-Cookie': 'followup=synthetic; Path=/; HttpOnly',
        });
        res.end(
          `<html><title>Capture follow-up ${suffix}</title><article><h1>Capture follow-up ${suffix}</h1><p>${'Loaded article text and public CDN images should remain readable offline. '.repeat(12)}</p><picture><source srcset="http://127.0.0.1:4189/image.svg"><img src="/redirect" alt="Cross origin fixture"></picture><img src="/redirect" alt="Redirected fixture"><p>Final follow-up sentence.</p></article></html>`,
        );
      });
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      servers.push(server);
      adb('reverse', `tcp:${port}`, `tcp:${port}`);
    }
  }
  const url = realUrl && !realUrl.startsWith('--') ? realUrl : localUrl;
  assert(/^https?:\/\//.test(url));
  await attach();
  if (!process.argv.includes('--existing')) {
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
      url,
    );
    await expect(
      main.getByRole('button', { name: 'Open capture browser', exact: true }),
    ).toBeVisible();
    await main.getByRole('button', { name: 'Open capture browser', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await (await fetch(endpoint + '/json/list')).json()).some((t) =>
            t.url.startsWith(new URL(url).origin),
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    await attach();
  }
  const capture = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().startsWith(new URL(url).origin));
  assert(capture);
  await capture.waitForLoadState('domcontentloaded');
  assert.equal(await capture.evaluate(() => typeof window.PostKeeperNative), 'undefined');
  if (url !== localUrl) {
    // Text-only diagnostics: never screenshot or export a third-party page.
    console.log(
      await capture.evaluate(() => ({
        title: document.title,
        textLength: document.body.innerText.length,
        images: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
        loginPrompt: /log in|sign in|continue reading in the app/i.test(document.body.innerText),
      })),
    );
    if (new URL(url).hostname === 'www.reddit.com') {
      const script = await readFile(
        new URL('../apps/android/app/src/main/assets/capture.js', import.meta.url),
        'utf8',
      );
      const draft = JSON.parse(await capture.evaluate(script));
      assert(
        draft.extractedReaderHtml.includes('ee4mri4o7coh1'),
        'Main Reddit photo must survive extraction.',
      );
      await tap('Save page');
      await expect(main.getByRole('heading', { name: /Best nap buddies/ })).toBeVisible({
        timeout: 60000,
      });
      await expect
        .poll(
          () =>
            main
              .frameLocator('[title="Safe reader"]')
              .locator('img')
              .evaluateAll(
                (imgs) => imgs.filter((i) => i.complete && i.naturalWidth >= 500).length,
              ),
          { timeout: 30000 },
        )
        .toBeGreaterThan(0);
      console.log('PASS: supplied Reddit main photo saved and decoded locally.');
    } else await tap('Library');
  } else {
    await expect(capture.getByAltText('Cross origin fixture')).toBeVisible();
    await tap('Save page');
    await expect(
      main.getByRole('heading', { name: `Capture follow-up ${suffix}`, exact: true }),
    ).toBeVisible({ timeout: 60000 });
    const reader = main.frameLocator('[title="Safe reader"]');
    await expect(reader.getByText('Final follow-up sentence.')).toBeVisible();
    await expect
      .poll(() =>
        reader
          .locator('img')
          .evaluateAll(
            (imgs) => imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await expect(main.locator('[title="Safe reader"]')).toHaveAttribute('sandbox', '');
    // Browser image loads may carry their profile's same-host cookie across ports;
    // native HTTP image fetches must omit it for the other origin.
    assert(
      receivedCookies.some((c) => c === ''),
      'Native public CDN fetch must be credential-free.',
    );
    console.log('PASS: native responsive cross-origin image decoded in isolated saved reader.');
    await main.reload();
    await main.getByRole('button', { name: new RegExp(`Capture follow-up ${suffix}`) }).click();
    await expect
      .poll(() =>
        main
          .frameLocator('[title="Safe reader"]')
          .locator('img')
          .evaluateAll(
            (imgs) => imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0),
          ),
      )
      .toBe(true);
    console.log('PASS: saved image survives library reload. Synthetic article retained.');
    await main.getByRole('button', { name: 'Open capture browser', exact: true }).click();
    await expect
      .poll(async () =>
        (await (await fetch(endpoint + '/json/list')).json()).some((t) => t.url === localUrl),
      )
      .toBe(true);
    await attach();
    await tap('Browser options');
    await tap('Save full page (if article text is missing)');
    await expect(main.locator('.capture-warning')).toContainText('producer-full-page-copy', {
      timeout: 30000,
    });
    await expect(
      main.frameLocator('[title="Safe reader"]').getByText('Final follow-up sentence.'),
    ).toBeVisible();
    console.log('PASS: native full-page fallback reaches the sanitized saved reader.');
  }
} finally {
  await browser?.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (servers.length) for (const port of [4188, 4189]) adb('reverse', '--remove', `tcp:${port}`);
  adb('shell', 'rm', '-f', '/data/local/tmp/postkeeper-followup-ui.xml');
}
