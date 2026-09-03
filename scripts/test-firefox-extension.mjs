/* global ChromeUtils, Services, WebExtensionPolicy, console, document, process, URL */

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const pwaOrigin = 'http://127.0.0.1:4173';
const fixtureOrigin = 'http://127.0.0.1:4174';
const pwaPermission = 'http://127.0.0.1/*';

const mediaTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

async function startStaticServer(root, port, spaFallback) {
  const absoluteRoot = path.resolve(root);
  const server = createServer((request, response) => {
    void (async () => {
      const requestPath = decodeURIComponent(
        new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname,
      );
      let filePath = path.resolve(absoluteRoot, requestPath.replace(/^\/+/, ''));
      if (filePath !== absoluteRoot && !filePath.startsWith(`${absoluteRoot}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }
      try {
        if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
      } catch {
        if (spaFallback) filePath = path.join(absoluteRoot, 'index.html');
        else {
          response.writeHead(404).end();
          return;
        }
      }
      const bytes = await readFile(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': mediaTypes[path.extname(filePath)] ?? 'application/octet-stream',
      });
      response.end(bytes);
    })().catch((cause) => response.writeHead(500).end(String(cause)));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function stopServer(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((cause) => (cause ? reject(cause) : resolve()));
  });
}

async function grantLocalPwaPermission(driver) {
  // WebDriver clicks do not receive Firefox's permissions.request user-activation token.
  // Preauthorize only the disposable profile's local test origin, then exercise the exact bundle.
  await driver.setContext(firefox.Context.CHROME);
  const result = await driver.executeAsyncScript((originPattern, done) => {
    const { ExtensionParent } = ChromeUtils.importESModule(
      'resource://gre/modules/ExtensionParent.sys.mjs',
    );
    const { ExtensionPermissions } = ChromeUtils.importESModule(
      'resource://gre/modules/ExtensionPermissions.sys.mjs',
    );
    const extension = ExtensionParent.GlobalManager.extensionMap.get('postkeeper@local.invalid');
    if (!extension) {
      done({ error: 'Installed PostKeeper extension was not found.', ok: false });
      return;
    }
    ExtensionPermissions.add(
      extension.id,
      { data_collection: [], origins: [originPattern], permissions: [] },
      extension,
    ).then(
      async () => {
        const policy = WebExtensionPolicy.getByID(extension.id);
        done({
          ok: policy.allowedOrigins.matches(Services.io.newURI('http://127.0.0.1:4173/')),
          stored: (await ExtensionPermissions.get(extension.id)).origins,
        });
      },
      (cause) => done({ error: String(cause), ok: false }),
    );
  }, pwaPermission);
  assert.equal(result?.ok, true, `Could not grant local PWA permission: ${result?.error}`);
  assert.deepEqual(result.stored, [pwaPermission]);
}

async function configureLocalPwa(driver) {
  await driver.setContext(firefox.Context.CHROME);
  const optionsUrl = await driver.executeScript(() => {
    const { ExtensionParent } = ChromeUtils.importESModule(
      'resource://gre/modules/ExtensionParent.sys.mjs',
    );
    const extension = ExtensionParent.GlobalManager.extensionMap.get('postkeeper@local.invalid');
    if (!extension) throw new Error('Installed PostKeeper extension was not found.');
    return extension.baseURI.resolve('options.html');
  });
  await driver.setContext(firefox.Context.CONTENT);
  await driver.get(optionsUrl);
  const input = await driver.wait(until.elementLocated(By.id('pwa-url')), 10_000);
  await driver.wait(
    async () => (await input.getAttribute('value')) === 'https://keep.fishese.cc/',
    10_000,
  );
  await input.clear();
  await input.sendKeys(`${pwaOrigin}/`);
  await driver.findElement(By.css('#settings-form button[type="submit"]')).click();
  await driver.wait(
    until.elementTextIs(driver.findElement(By.id('status')), 'Settings saved.'),
    10_000,
  );
}

async function openToolbarPopup(driver) {
  await driver.setContext(firefox.Context.CHROME);
  await driver.findElement(By.id('unified-extensions-button')).click();
  const action = await driver.wait(
    until.elementLocated(By.id('postkeeper_local_invalid-BAP')),
    10_000,
  );
  await action.click();
  await driver.wait(
    async () =>
      driver.executeScript(() =>
        [...document.querySelectorAll('browser')].some((element) =>
          element.currentURI?.spec?.endsWith('/popup.html'),
        ),
      ),
    10_000,
  );
}

async function executePopupSave(driver, targetUrl) {
  await driver.setContext(firefox.Context.CHROME);
  return driver.executeAsyncScript((url, done) => {
    const popupBrowser = [...document.querySelectorAll('browser')].find((element) =>
      element.currentURI?.spec?.endsWith('/popup.html'),
    );
    if (!popupBrowser) {
      done({ error: 'Firefox extension popup browser is unavailable.', ok: false });
      return;
    }
    const actor = popupBrowser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands');
    actor
      .executeScript(
        `const [targetUrl] = arguments;
       const done = arguments[arguments.length - 1];
       browser.tabs.query({})
         .then(async (tabs) => {
           const tab = tabs.find((candidate) => candidate.url === targetUrl);
           if (!tab) throw new Error('Target fixture tab was not found: ' + targetUrl);
           const hasPwaPermission = await browser.permissions.contains({
             origins: ['http://127.0.0.1/*'],
           });
           return {
             hasPwaPermission,
             response: await browser.runtime.sendMessage({
               type: 'postkeeper:save-page',
               tabId: tab.id,
             }),
           };
         })
         .then(done, (cause) => done({ ok: false, error: String(cause) }));`,
        [url],
        {
          async: true,
          filename: 'postkeeper-firefox-test',
          line: 1,
          newSandbox: true,
          scriptTimeout: 30_000,
        },
      )
      .then(done, (cause) => done({ error: String(cause), ok: false }));
  }, targetUrl);
}

async function pendingTransferCount(driver) {
  await driver.setContext(firefox.Context.CHROME);
  return driver.executeAsyncScript((done) => {
    const extensionBrowser = [...document.querySelectorAll('browser')].find((element) =>
      /moz-extension:.*\/(?:popup|background)\.html/.test(element.currentURI?.spec ?? ''),
    );
    if (!extensionBrowser) {
      done({ error: 'Firefox extension document is unavailable.' });
      return;
    }
    const actor =
      extensionBrowser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands');
    actor
      .executeScript(
        `const done = arguments[arguments.length - 1];
       const request = indexedDB.open('postkeeper-extension-queue', 1);
       request.onerror = () => done({ error: String(request.error) });
       request.onsuccess = () => {
         const database = request.result;
         const count = database.transaction('pending').objectStore('pending').count();
         count.onerror = () => done({ error: String(count.error) });
         count.onsuccess = () => {
           database.close();
           done({ count: count.result });
         };
       };`,
        [],
        {
          async: true,
          filename: 'postkeeper-firefox-queue-test',
          line: 1,
          newSandbox: true,
          scriptTimeout: 10_000,
        },
      )
      .then(done, (cause) => done({ error: String(cause) }));
  });
}

async function acceptLocalStoragePrompt(driver) {
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(() => {
    const popup = document.querySelector('#notification-popup');
    if (popup?.textContent?.includes('store data in persistent storage')) {
      popup.querySelector('.popup-notification-primary-button:not([hidden])')?.click();
    }
  });
}

async function waitForImportedArticle(driver, expectedTitle) {
  console.log(`Waiting for durable import: ${expectedTitle}`);
  await driver.setContext(firefox.Context.CONTENT);
  try {
    await driver.wait(async () => {
      for (const handle of await driver.getAllWindowHandles()) {
        await driver.switchTo().window(handle);
        if (!(await driver.getCurrentUrl()).startsWith(pwaOrigin)) continue;
        const body = await driver.findElement(By.css('body')).getText();
        if (body.includes(`Imported “${expectedTitle}”`)) return true;
      }
      return false;
    }, 30_000);
  } catch (cause) {
    const tabs = [];
    for (const handle of await driver.getAllWindowHandles()) {
      await driver.switchTo().window(handle);
      tabs.push({
        body: (await driver.findElement(By.css('body')).getText()).slice(0, 500),
        url: await driver.getCurrentUrl(),
      });
    }
    console.error('Firefox import timeout tabs:', tabs);
    throw cause;
  }
  const pwaHandle = await driver.getWindowHandle();
  assert.doesNotMatch(await driver.getCurrentUrl(), /pkSecret|pkTransfer/);
  return pwaHandle;
}

async function assertReader(driver, { absentText, imageAlt, text }) {
  await driver.setContext(firefox.Context.CONTENT);
  const frame = await driver.wait(
    until.elementLocated(By.css('[data-testid="reader-frame"]')),
    10_000,
  );
  await driver.switchTo().frame(frame);
  const readerBody = await driver.findElement(By.css('body'));
  assert.match(await readerBody.getText(), new RegExp(text));
  if (absentText) {
    assert.doesNotMatch(await readerBody.getAttribute('innerHTML'), new RegExp(absentText));
    assert.equal((await driver.findElements(By.css('input'))).length, 0);
  }
  const image = await driver.findElement(By.css(`img[alt="${imageAlt}"]`));
  assert.equal(await image.isDisplayed(), true);
  await driver.wait(
    async () =>
      (await image.getAttribute('complete')) === 'true' &&
      Number(await image.getAttribute('naturalWidth')) > 0,
    10_000,
    'Captured image did not decode.',
  );
  await driver.switchTo().defaultContent();
}

async function saveFixture(driver, fixtureHandle, targetUrl, expectedTitle) {
  console.log(`Saving Firefox fixture: ${targetUrl}`);
  await driver.setContext(firefox.Context.CONTENT);
  await driver.switchTo().window(fixtureHandle);
  await openToolbarPopup(driver);
  const result = await executePopupSave(driver, targetUrl);
  console.log('Firefox save response:', result);
  assert.equal(result?.hasPwaPermission, true);
  assert.equal(result?.response?.ok, true, result?.response?.message ?? result?.error);
  const pwaHandle = await waitForImportedArticle(driver, expectedTitle);
  await acceptLocalStoragePrompt(driver);
  await driver.setContext(firefox.Context.CONTENT);
  await driver.switchTo().window(pwaHandle);
  return pwaHandle;
}

async function main() {
  const servers = await Promise.all([
    startStaticServer('apps/web/dist', 4173, true),
    startStaticServer('packages/test-fixtures', 4174, false),
  ]);
  const options = new firefox.Options()
    .setBinary('C:\\Program Files\\Mozilla Firefox\\firefox.exe')
    .addArguments('-headless', '-no-remote')
    .setPreference('browser.shell.checkDefaultBrowser', false)
    .setPreference('browser.startup.homepage_override.mstone', 'ignore');
  const service = new firefox.ServiceBuilder().addArguments('--allow-system-access');
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();

  try {
    const capabilities = await driver.getCapabilities();
    const addonId = await driver.installAddon(path.resolve('apps/extension/dist-firefox'), true);
    assert.equal(addonId, 'postkeeper@local.invalid');
    await grantLocalPwaPermission(driver);
    await configureLocalPwa(driver);

    await driver.setContext(firefox.Context.CONTENT);
    await driver.get(`${fixtureOrigin}/public-article.html`);
    await driver.wait(until.elementLocated(By.css('h1')), 10_000);
    const fixtureHandle = await driver.getWindowHandle();

    let pwaHandle = await saveFixture(
      driver,
      fixtureHandle,
      `${fixtureOrigin}/public-article.html`,
      'Public fixture article',
    );
    console.log('Checking public Firefox reader and queue acknowledgement.');
    await assertReader(driver, {
      imageAlt: 'fixture',
      text: 'This local page represents readable public content\\.',
    });
    let queue = await pendingTransferCount(driver);
    assert.equal(queue?.count, 0, queue?.error);

    await driver.setContext(firefox.Context.CONTENT);
    await driver.switchTo().window(fixtureHandle);
    await driver.get(`${fixtureOrigin}/sign-in.html`);
    await driver.findElement(By.css('button')).click();
    await driver.wait(until.elementLocated(By.css('article')), 10_000);
    await driver.executeScript(() => {
      document.cookie = 'session-super-secret=must-not-export; SameSite=Lax';
      const password = document.createElement('input');
      password.type = 'password';
      password.value = 'must-not-export-password';
      document.querySelector('article')?.append(password);
    });

    pwaHandle = await saveFixture(
      driver,
      fixtureHandle,
      `${fixtureOrigin}/authenticated.html`,
      'Authenticated fixture',
    );
    console.log('Checking authenticated Firefox reader, secret filtering, and queue.');
    assert.doesNotMatch(await driver.findElement(By.css('body')).getText(), /must-not-export/);
    await assertReader(driver, {
      absentText: 'must-not-export',
      imageAlt: 'authenticated asset',
      text: 'This fixture is visible only after the harmless test cookie is present\\.',
    });
    queue = await pendingTransferCount(driver);
    assert.equal(queue?.count, 0, queue?.error);

    await driver.setContext(firefox.Context.CONTENT);
    await driver.switchTo().window(pwaHandle);
    console.log(
      `Firefox ${capabilities.get('browserVersion')} extension runtime passed: public capture, authenticated capture, image import, secret filtering, fragment cleanup, and queue acknowledgement.`,
    );
  } finally {
    await driver.quit();
    await Promise.all(servers.map(stopServer));
  }
}

if (process.argv.includes('--serve-only')) {
  await Promise.all([
    startStaticServer('apps/web/dist', 4173, true),
    startStaticServer('packages/test-fixtures', 4174, false),
  ]);
  console.log('Extension test servers listening on 127.0.0.1:4173 and 127.0.0.1:4174.');
  await new Promise(() => undefined);
} else {
  await main();
}
