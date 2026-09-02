/* global console, process, fetch */

// Explicitly opt-in live acceptance test. Never included in CI.
// The emulator must contain only the development fixture, be connected to Drive,
// and display a recovery key that the user has already saved and confirmed.
// Only the desktop test client's GIS response is supplied by the harness: it
// reuses the emulator's app-scoped token in memory. Every Drive call is real.
import { randomBytes } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const endpoint = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(endpoint ?? '')) {
  throw new Error('Supply the explicitly approved loopback emulator debugging endpoint.');
}
if (!process.argv.includes('--allow-live-drive')) {
  throw new Error('Live fixture writes require --allow-live-drive.');
}
const revokeAtEnd = process.argv.includes('--revoke-at-end');
const origin = 'https://keep.fishese.cc/';
const fixtureTitle = 'A public fixture article';
let recoveryKey = '';
let accessToken = '';
let emulator;
let desktop;
let source;
let sourceNetwork;
let cleanContext;
const observations = new Set();
const observationErrors = [];
const uploadedIds = new Set();
let auditedUploads = 0;
let realUnauthorizedResponses = 0;

function check(condition, message) {
  // Do not include actual/expected secrets in assertion diagnostics.
  if (!condition) throw new Error(message);
}

function observe(promise) {
  observations.add(promise);
  void promise
    .catch((error) => observationErrors.push(error))
    .finally(() => observations.delete(promise));
}

async function settleObservations() {
  while (observations.size) await Promise.allSettled([...observations]);
  if (observationErrors.length) throw observationErrors[0];
}

function auditPage(page) {
  page.on('request', (request) => {
    if (!request.url().startsWith('https://www.googleapis.com/')) return;
    observe(
      (async () => {
        const headers = await request.allHeaders();
        const bearer = headers.authorization;
        if (bearer?.startsWith('Bearer ')) accessToken = bearer.slice(7);
        if (request.method() !== 'POST' && request.method() !== 'PATCH') return;
        const body = request.postData() ?? '';
        check(body.includes('"ciphertext"'), 'Upload was not an encrypted envelope.');
        for (const secret of [
          recoveryKey,
          fixtureTitle,
          'alpine marmot',
          'https://fixtures.postkeeper.local/public-article',
        ]) {
          check(!body.includes(secret), 'Plaintext or recovery material appeared in an upload.');
        }
        auditedUploads += 1;
      })(),
    );
  });
  page.on('response', (response) => {
    if (!response.url().startsWith('https://www.googleapis.com/')) return;
    if (response.status() === 401) realUnauthorizedResponses += 1;
    if (response.request().method() !== 'POST' || !response.ok()) return;
    observe(
      (async () => {
        const metadata = await response.json();
        if (typeof metadata.id === 'string') uploadedIds.add(metadata.id);
      })(),
    );
  });
}

async function runAction(page, buttonName, expected = 'synced') {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await expect
    .poll(
      async () => {
        const state = await page.getByTestId('sync-state').innerText();
        return state.startsWith('pending') ? 'pending' : 'finished';
      },
      { timeout: 240_000, intervals: [300, 500, 1000] },
    )
    .toBe('finished');
  const state = await page.getByTestId('sync-state').innerText();
  check(state.startsWith(expected), `Expected ${expected}: ${state}`);
  await settleObservations();
  console.log(`${buttonName}: ${state}`);
}

async function selectFixture(page) {
  await page.getByRole('button', { name: 'All items', exact: true }).click();
  await page.getByRole('button', { name: /A public fixture article/u }).click();
  const reader = page.frameLocator('[data-testid="reader-frame"]');
  await expect(reader.getByRole('heading', { name: fixtureTitle, exact: true })).toBeVisible();
  await expect(reader.getByRole('img', { name: 'fixture', exact: true })).toBeVisible();
  await expect
    .poll(
      () =>
        reader
          .getByRole('img', { name: 'fixture', exact: true })
          .evaluate((image) => image.complete && image.naturalWidth > 0),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function addCategory(page, name) {
  await page.getByLabel('New category', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name, exact: true }).check();
}

async function setSourceOffline(offline) {
  await sourceNetwork.send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

try {
  emulator = await chromium.connectOverCDP(endpoint);
  const matches = emulator
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => page.url() === origin);
  check(matches.length === 1, 'Expected exactly one existing PostKeeper emulator tab.');
  source = matches[0];
  source.setDefaultTimeout(15_000);
  check(
    (await source.getByTestId('article-list').innerText()).includes(fixtureTitle),
    'The development fixture is required.',
  );
  check(
    (await source.getByTestId('article-list').locator('li').count()) === 1,
    'Only the harmless development fixture may be present.',
  );
  check(
    await source.getByRole('button', { name: 'Disconnect Google Drive', exact: true }).isVisible(),
    'Connect the emulator to Drive first.',
  );
  check(
    await source.getByRole('checkbox', { name: /I saved the recovery key/u }).isChecked(),
    'The user must save and confirm the recovery key before this test.',
  );
  recoveryKey = await source.getByTestId('recovery-key').inputValue();
  check(
    /^pk1_[A-Za-z0-9_-]{43}$/u.test(recoveryKey),
    'The displayed recovery key has an invalid format.',
  );
  auditPage(source);
  sourceNetwork = await source.context().newCDPSession(source);
  await sourceNetwork.send('Network.enable');
  await runAction(source, 'Sync now');
  check(Boolean(accessToken), 'No live app-scoped token was observed.');
  console.log('PASS: initial encrypted upload from Android.');

  desktop = await chromium.launch({ channel: 'chrome', headless: true });
  cleanContext = await desktop.newContext();
  const target = await cleanContext.newPage();
  target.setDefaultTimeout(15_000);
  await target.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.google={accounts:{oauth2:{initTokenClient(config){return{requestAccessToken(){config.callback({access_token:${JSON.stringify(accessToken)},expires_in:3600});}};},revoke(_token,callback){callback();}}}};`,
    }),
  );
  auditPage(target);
  await target.goto(origin);
  await expect(target.getByTestId('article-list').locator('li')).toHaveCount(0);
  await target.getByRole('button', { name: 'Load Google sign-in', exact: true }).click();
  await target.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await expect(target.getByTestId('sync-state')).toContainText('Google Drive connected');

  await target
    .getByLabel('Restore or unlock with a recovery key')
    .fill(`pk1_${randomBytes(32).toString('base64url')}`);
  await runAction(target, 'Verify and restore', 'error');
  await expect(target.getByTestId('article-list').locator('li')).toHaveCount(0);
  console.log('PASS: wrong key rejected without importing metadata.');

  let downloadCount = 0;
  const mediaPattern = 'https://www.googleapis.com/drive/v3/files/*?alt=media';
  await target.route(mediaPattern, async (route) => {
    downloadCount += 1;
    if (downloadCount === 3) await route.abort('internetdisconnected');
    else await route.continue();
  });
  await target.getByLabel('Restore or unlock with a recovery key').fill(recoveryKey);
  await runAction(target, 'Verify and restore', 'error');
  check(downloadCount >= 3, 'Download fault was not injected.');
  await expect(target.getByTestId('article-list').locator('li')).toHaveCount(0);
  await target.unroute(mediaPattern);
  await runAction(target, 'Verify and restore');
  await selectFixture(target);
  await target.getByRole('checkbox', { name: /I saved the recovery key/u }).check();
  console.log('PASS: interrupted restore safely repeated; metadata, reader, and image restored.');

  await selectFixture(source);
  await setSourceOffline(true);
  await cleanContext.setOffline(true);
  const runId = Date.now();
  const androidCategory = `Android acceptance ${runId}`;
  const desktopCategory = `Desktop acceptance ${runId}`;
  await addCategory(source, androidCategory);
  if (await source.getByRole('button', { name: 'Favorite', exact: true }).isVisible()) {
    await source.getByRole('button', { name: 'Favorite', exact: true }).click();
  }
  await addCategory(target, desktopCategory);
  if (await target.getByRole('button', { name: 'Mark read', exact: true }).isVisible()) {
    await target.getByRole('button', { name: 'Mark read', exact: true }).click();
  }
  await selectFixture(source);
  await selectFixture(target);
  console.log('PASS: independent offline edits and local image reading on both clients.');
  await setSourceOffline(false);
  await cleanContext.setOffline(false);

  let uploadCount = 0;
  const uploadPattern = 'https://www.googleapis.com/upload/drive/v3/files?*';
  await target.route(uploadPattern, async (route) => {
    if (route.request().method() === 'POST') uploadCount += 1;
    if (uploadCount === 2) await route.abort('internetdisconnected');
    else await route.continue();
  });
  await runAction(target, 'Sync now', 'error');
  check(uploadCount >= 2, 'Upload fault was not injected after partial progress.');
  await target.unroute(uploadPattern);
  await runAction(target, 'Sync now');
  console.log('PASS: interrupted upload safely repeated.');
  await runAction(source, 'Sync now');
  await runAction(target, 'Sync now');
  for (const page of [source, target]) {
    await selectFixture(page);
    await expect(page.getByRole('checkbox', { name: androidCategory, exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: desktopCategory, exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Unfavorite', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark unread', exact: true })).toBeVisible();
  }
  console.log('PASS: Android and clean desktop converge on memberships, favorite, and read state.');

  await settleObservations();
  check(uploadedIds.size > 0 && auditedUploads > 0, 'No real uploads were audited.');
  for (const id of uploadedIds) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    check(response.ok, `Uploaded-object verification failed (${response.status}).`);
    const body = await response.text();
    const envelope = JSON.parse(body);
    check(
      envelope.version === 1 &&
        ['postkeeper-wrapped-master-key', 'postkeeper-encrypted-object'].includes(envelope.kind),
      'Unexpected remote envelope.',
    );
    check(
      envelope.cipher?.name === 'AES-GCM' && typeof envelope.cipher.ciphertext === 'string',
      'Missing remote ciphertext.',
    );
    check(
      !('masterKey' in envelope) && !('recoveryKey' in envelope),
      'Raw key field in remote envelope.',
    );
    for (const plaintext of [
      recoveryKey,
      fixtureTitle,
      'alpine marmot',
      'https://fixtures.postkeeper.local/public-article',
      androidCategory,
      desktopCategory,
    ]) {
      check(!body.includes(plaintext), 'Plaintext appeared in a downloaded remote envelope.');
    }
  }
  console.log(
    `PASS: ${uploadedIds.size} created Drive objects inspected as encrypted envelopes; ${auditedUploads} upload requests audited.`,
  );

  if (revokeAtEnd) {
    await source.getByRole('button', { name: 'Disconnect Google Drive', exact: true }).click();
    await expect(source.getByTestId('sync-state')).toContainText('Disconnected from Google Drive');
    await runAction(target, 'Sync now', 'reconnect-required');
    check(realUnauthorizedResponses > 0, 'Expected a real Google 401 after revocation.');
    await selectFixture(target);
    await target.getByRole('button', { name: 'Mark unread', exact: true }).click();
    await expect(target.getByRole('button', { name: 'Mark read', exact: true })).toBeVisible();
    console.log(
      'PASS: real consent revocation requires reconnection while local reading/editing remains usable.',
    );
  }
  console.log(
    'Live acceptance finished. Keep the saved recovery key; fixture objects remain in the app-data folder.',
  );
} catch (cause) {
  let message = cause instanceof Error ? cause.message : String(cause);
  for (const secret of [recoveryKey, accessToken])
    if (secret) message = message.replaceAll(secret, '[REDACTED]');
  message = message.replaceAll(/pk1_[A-Za-z0-9_-]{43}/gu, '[REDACTED RECOVERY KEY]');
  console.error(message);
  process.exitCode = 1;
} finally {
  await cleanContext?.setOffline(false).catch(() => {});
  if (sourceNetwork) {
    await setSourceOffline(false).catch(() => {});
    await sourceNetwork.detach().catch(() => {});
  }
  await desktop?.close().catch(() => {});
  await emulator?.close().catch(() => {});
  recoveryKey = '';
  accessToken = '';
}
