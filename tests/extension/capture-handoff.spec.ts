import {
  expect,
  test,
  chromium,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { cp, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

const fixtureOrigin = 'http://127.0.0.1:4281';

const mediaTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

async function startStaticServer(
  root: string,
  port: number,
  spaFallback: boolean,
): Promise<Server> {
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
    })().catch((cause: unknown) => {
      response.writeHead(500).end(cause instanceof Error ? cause.message : String(cause));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

async function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((cause) => (cause ? reject(cause) : resolve()));
  });
}

let servers: Server[] = [];

test.beforeAll(async () => {
  servers = await Promise.all([
    startStaticServer('apps/web/dist', 4280, true),
    startStaticServer('packages/test-fixtures', 4281, false),
  ]);
});

test.afterAll(async () => {
  await Promise.all(servers.map(stopServer));
});

async function extensionId(context: BrowserContext): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return new URL(worker.url()).hostname;
}

async function prepareExtension(outputPath: string): Promise<string> {
  const extensionPath = path.join(outputPath, 'chromium-extension');
  await cp(path.resolve('apps/extension/dist-chromium'), extensionPath, { recursive: true });
  const manifestPath = path.join(extensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return extensionPath;
}

async function pendingTransferCount(context: BrowserContext): Promise<number> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return worker.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('postkeeper-extension-queue', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = database.transaction('pending').objectStore('pending').count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function launchExtension(testInfo: TestInfo): Promise<{
  context: BrowserContext;
  id: string;
}> {
  const extensionPath = await prepareExtension(testInfo.outputPath('extension-runtime'));
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const id = await extensionId(context);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(() => chrome.storage.local.set({ pwaUrl: 'http://127.0.0.1:4280/' }));
  return { context, id };
}

async function saveActivePage(
  context: BrowserContext,
  id: string,
  activePage: Page,
  existingPostKeeper?: Page,
): Promise<Page> {
  const popup = await context.newPage();
  await activePage.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByText('Ready.')).toBeVisible();
  const postKeeperPagePromise =
    existingPostKeeper ??
    context.waitForEvent('page', (page) => page.url().startsWith('http://127.0.0.1:4280/'));
  await popup.getByRole('button', { name: 'Save current page' }).click();
  const postKeeper = await postKeeperPagePromise;
  await postKeeper.waitForLoadState('domcontentloaded');
  return postKeeper;
}

test('captures a rendered page, imports it durably, and acknowledges the queue', async () => {
  const testInfo = test.info();
  const { context, id } = await launchExtension(testInfo);

  try {
    const articlePage = await context.newPage();
    await articlePage.goto(`${fixtureOrigin}/public-article.html`);
    await expect(
      articlePage.getByRole('heading', { name: 'A public fixture article' }),
    ).toBeVisible();

    const postKeeper = await saveActivePage(context, id, articlePage);

    await expect(postKeeper.getByTestId('extension-transfer-status')).toContainText(
      'Imported “Public fixture article”',
    );
    await expect(postKeeper.getByTestId('article-list')).toContainText('Public fixture article');
    await expect(postKeeper).not.toHaveURL(/pkSecret|pkTransfer/);
    await expect.poll(() => pendingTransferCount(context)).toBe(0);

    const reader = postKeeper.frameLocator('[data-testid="reader-frame"]');
    await expect(
      reader.getByText('This local page represents readable public content.'),
    ).toBeVisible();
    await expect(reader.getByRole('img', { name: 'fixture' })).toBeVisible();
    await expect
      .poll(() =>
        reader
          .getByRole('img', { name: 'fixture' })
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);

    // Recapture the selected article in the same PWA document. The ID remains the same,
    // but both the snapshot and visible reader must advance, without replay errors.
    const transferErrors: string[] = [];
    await postKeeper.exposeFunction('recordTransferError', (error: string) =>
      transferErrors.push(error),
    );
    await postKeeper.evaluate(() => {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'postkeeper:transfer-error') {
          void (
            window as unknown as { recordTransferError: (error: string) => Promise<void> }
          ).recordTransferError(event.data.error);
        }
      });
    });
    await articlePage.evaluate(() => {
      document.querySelector('article p')!.textContent =
        'Updated fixture content from a second capture of this same article.';
    });
    await saveActivePage(context, id, articlePage, postKeeper);
    await expect.poll(() => pendingTransferCount(context)).toBe(0);
    await expect(
      reader.getByText('Updated fixture content from a second capture of this same article.'),
    ).toBeVisible();
    expect(transferErrors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('captures a cookie-authenticated page without exporting session data', async () => {
  const testInfo = test.info();
  const { context, id } = await launchExtension(testInfo);

  try {
    const articlePage = await context.newPage();
    await articlePage.goto(`${fixtureOrigin}/sign-in.html`);
    await articlePage.getByRole('button', { name: 'Set test cookie' }).click();
    await expect(
      articlePage.getByRole('heading', { name: 'Authenticated fixture article' }),
    ).toBeVisible();
    await articlePage.evaluate(() => {
      document.cookie = 'session-super-secret=must-not-export; SameSite=Lax';
      const password = document.createElement('input');
      password.type = 'password';
      password.value = 'must-not-export-password';
      document.querySelector('article')?.append(password);
    });

    const postKeeper = await saveActivePage(context, id, articlePage);
    await expect(postKeeper.getByTestId('extension-transfer-status')).toContainText(
      'Imported “Authenticated fixture”',
    );
    await expect(postKeeper.getByTestId('article-list')).toContainText('Authenticated fixture');
    const reader = postKeeper.frameLocator('[data-testid="reader-frame"]');
    await expect(
      reader.getByText('This fixture is visible only after the harmless test cookie is present.'),
    ).toBeVisible();
    await expect(reader.locator('input')).toHaveCount(0);
    await expect
      .poll(() =>
        reader
          .getByRole('img', { name: 'authenticated asset' })
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await expect(postKeeper.locator('body')).not.toContainText('must-not-export');
    await expect.poll(() => pendingTransferCount(context)).toBe(0);
  } finally {
    await context.close();
  }
});

test('popup opened as its own tab saves the explicitly selected original page', async () => {
  const { context, id } = await launchExtension(test.info());
  try {
    const article = await context.newPage();
    await article.goto(`${fixtureOrigin}/public-article.html`);
    const popup = await context.newPage();
    await popup.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const picker = popup.getByRole('combobox', { name: 'Choose the page to save' });
    await expect(picker).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Save current page' })).toBeDisabled();
    await picker.selectOption({ label: `${fixtureOrigin}/public-article.html` });
    const opened = context.waitForEvent('page', (page) =>
      page.url().startsWith('http://127.0.0.1:4280/'),
    );
    await popup.getByRole('button', { name: 'Save current page' }).click();
    const pwa = await opened;
    await expect(pwa.getByTestId('extension-transfer-status')).toContainText(
      'Imported “Public fixture article”',
    );
    await expect.poll(() => pendingTransferCount(context)).toBe(0);
  } finally {
    await context.close();
  }
});

test('Chromium toolbar page keeps its exact source and becomes the importing PWA', async () => {
  const { context, id } = await launchExtension(test.info());
  try {
    const article = await context.newPage();
    const articleUrl = `${fixtureOrigin}/public-article.html`;
    await article.goto(articleUrl);
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const sourceTabId = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      if (tab?.id === undefined) throw new Error('Fixture tab was not found.');
      return tab.id;
    }, articleUrl);
    const actionPage = await context.newPage();
    const token = crypto.randomUUID();
    await worker.evaluate(
      async ({ key, source }) => {
        await chrome.scripting.executeScript({
          target: { tabId: source.tabId },
          files: ['capture.js'],
        });
        const response = await chrome.tabs.sendMessage(source.tabId, {
          type: 'postkeeper:capture-page',
        });
        if (!response?.ok || !response.draft) throw new Error('Fixture capture failed.');
        await chrome.storage.session.set({ [key]: { ...source, draft: response.draft } });
      },
      {
        key: `postkeeper-action-source-${token}`,
        source: { tabId: sourceTabId, tabUrl: articleUrl, expiresAt: Date.now() + 60_000 },
      },
    );
    await actionPage.goto(`chrome-extension://${id}/popup.html?source=${token}`);
    await expect(actionPage.getByText('Ready.')).toBeVisible();

    await actionPage.getByRole('button', { name: 'Save current page' }).click();

    await actionPage.waitForURL('http://127.0.0.1:4280/');
    await expect(actionPage.getByTestId('extension-transfer-status')).toContainText(
      'Imported “Public fixture article”',
    );
    await expect.poll(() => pendingTransferCount(context)).toBe(0);
  } finally {
    await context.close();
  }
});
