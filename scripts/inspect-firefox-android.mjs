/* global console, process, setTimeout, clearTimeout, URL */

import { connectToFirefox } from '../node_modules/web-ext/lib/firefox/rdp-client.js';

const port = Number(process.argv[2]);
const action = process.argv[3] ?? 'inspect-pwa';
if (!Number.isInteger(port)) throw new Error('Pass the forwarded Firefox RDP port.');

const ADDON_ID = 'postkeeper@local.invalid';
const LOCAL_URL_PREFIXES = ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/'];

function waitForEvaluation(client, consoleActor, text) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off('error', onError);
      reject(new Error('Timed out waiting for the Firefox evaluation result.'));
    }, 10_000);

    function onError(cause) {
      const prefix = 'Unexpected RDP message received: ';
      if (!cause.message.startsWith(prefix)) return;

      const message = JSON.parse(cause.message.slice(prefix.length));
      if (message.type !== 'evaluationResult' || message.from !== consoleActor) return;

      clearTimeout(timeout);
      client.off('error', onError);
      if (message.exceptionMessage) reject(new Error(message.exceptionMessage));
      else resolve(message.result?.value ?? message.result);
    }

    client.on('error', onError);
    client
      .request({
        to: consoleActor,
        type: 'evaluateJSAsync',
        text,
        await: true,
      })
      .catch((error) => {
        clearTimeout(timeout);
        client.off('error', onError);
        reject(error);
      });
  });
}

async function getLocalTabTarget(client, predicate) {
  const listed = await client.request('listTabs');
  const tab = listed.tabs.find(
    (candidate) =>
      LOCAL_URL_PREFIXES.some((prefix) => candidate.url.startsWith(prefix)) && predicate(candidate),
  );
  if (!tab) throw new Error('The requested local PostKeeper test tab was not found.');
  const target = await client.request({ to: tab.actor, type: 'getTarget' });
  return { tab, target };
}

const client = await connectToFirefox(port);
try {
  if (action === 'inject-auth') {
    const { target } = await getLocalTabTarget(client, (tab) =>
      tab.url.startsWith('http://127.0.0.1:4174/authenticated.html'),
    );
    const result = await waitForEvaluation(
      client,
      target.frame.consoleActor,
      `(() => {
        document.cookie = 'session-super-secret=must-not-export; SameSite=Lax; path=/';
        const password = document.createElement('input');
        password.type = 'password';
        password.value = 'must-not-export-password';
        password.setAttribute('value', 'must-not-export-password');
        password.dataset.postkeeperSecretProbe = 'true';
        document.querySelector('article')?.append(password);
        return JSON.stringify({
          url: location.href,
          title: document.title,
          passwordInputs: document.querySelectorAll('input[type="password"]').length,
          cookieProbePresent: document.cookie.includes('session-super-secret=must-not-export')
        });
      })()`,
    );
    console.log(result);
  } else if (action === 'inspect-pwa' || action === 'inspect-article') {
    const { target } = await getLocalTabTarget(client, (tab) =>
      tab.url.startsWith('http://127.0.0.1:4173/'),
    );
    if (action === 'inspect-article') {
      const requestedTitle = process.argv[4] ?? 'Authenticated fixture';
      const clicked = await waitForEvaluation(
        client,
        target.frame.consoleActor,
        `(() => {
          const requestedTitle = ${JSON.stringify(requestedTitle)};
          const button = [...document.querySelectorAll('[data-testid="article-list"] button')]
            .find((candidate) => candidate.querySelector('strong')?.textContent === requestedTitle);
          if (!button) return JSON.stringify({ clicked: false });
          button.click();
          return JSON.stringify({ clicked: true });
        })()`,
      );
      if (JSON.parse(clicked).clicked !== true)
        throw new Error('The requested article was not found.');
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    const result = await waitForEvaluation(
      client,
      target.frame.consoleActor,
      `(() => {
        const frame = document.querySelector('[data-testid="reader-frame"]');
        const parsedReader = frame?.srcdoc
          ? new DOMParser().parseFromString(frame.srcdoc, 'text/html')
          : null;
        return JSON.stringify({
          body: document.body?.innerText?.slice(0, 4000),
          readyState: document.readyState,
          url: location.href,
          reader: parsedReader ? {
            text: parsedReader.body?.innerText?.slice(0, 4000),
            passwordInputs: parsedReader.querySelectorAll('input[type="password"]').length,
            secretTextPresent: frame.srcdoc.includes('must-not-export'),
            sandbox: frame.getAttribute('sandbox'),
            referrerPolicy: frame.referrerPolicy,
            images: [...parsedReader.images].map((image) => ({
              alt: image.alt,
              srcProtocol: image.getAttribute('src')?.split(':', 1)[0] ?? null
            }))
          } : null
        });
      })()`,
    );
    console.log(result);
  } else if (action === 'inspect-queue') {
    const listed = await client.request('listAddons');
    const addon = listed.addons.find((candidate) => candidate.id === ADDON_ID);
    if (!addon?.manifestURL) throw new Error('The PostKeeper temporary add-on was not found.');
    const manifest = new URL(addon.manifestURL);
    const extensionOrigin = `${manifest.protocol}//${manifest.host}`;
    const watcher = await client.request({
      to: addon.actor,
      type: 'getWatcher',
      isServerTargetSwitchingEnabled: false,
    });
    const targets = [];
    function onWatcherError(cause) {
      const prefix = 'Unexpected RDP message received: ';
      if (!cause.message.startsWith(prefix)) return;
      const message = JSON.parse(cause.message.slice(prefix.length));
      if (message.from === watcher.actor && message.type === 'target-available-form') {
        targets.push(message.target);
      }
    }
    client.on('error', onWatcherError);
    const first = await client.request({
      to: watcher.actor,
      type: 'watchTargets',
      targetType: 'frame',
    });
    if (first.type === 'target-available-form') targets.push(first.target);
    await new Promise((resolve) => setTimeout(resolve, 750));
    client.off('error', onWatcherError);
    const target = targets.find(
      (candidate) =>
        candidate.url?.startsWith(extensionOrigin) &&
        (candidate.url.endsWith('/background.html') || candidate.isTopLevelTarget),
    );
    if (!target?.consoleActor) {
      throw new Error(
        `The PostKeeper background target was not found: ${JSON.stringify(
          targets.map((candidate) => ({
            url: candidate.url,
            keys: Object.keys(candidate).sort(),
          })),
        )}`,
      );
    }
    await waitForEvaluation(
      client,
      target.consoleActor,
      `(() => {
        globalThis.__postkeeperQueueDiagnostic = { state: 'pending' };
        void (async () => {
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('postkeeper-extension-queue', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const count = await new Promise((resolve, reject) => {
              const request = database.transaction('pending').objectStore('pending').count();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            globalThis.__postkeeperQueueDiagnostic = { state: 'complete', count };
          } catch (cause) {
            globalThis.__postkeeperQueueDiagnostic = { state: 'error', error: String(cause) };
          } finally {
            database.close();
          }
        })();
        return 'started';
      })()`,
    );
    await new Promise((resolve) => setTimeout(resolve, 750));
    const result = await waitForEvaluation(
      client,
      target.consoleActor,
      `(() => {
        const result = JSON.stringify(globalThis.__postkeeperQueueDiagnostic);
        delete globalThis.__postkeeperQueueDiagnostic;
        return result;
      })()`,
    );
    console.log(result);
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
} finally {
  client.disconnect();
}
