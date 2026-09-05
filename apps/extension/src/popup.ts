import { getExtensionApi, getSettings, originPattern } from './api';
import type { RuntimeRequest } from './messages';

const saveButton = document.querySelector<HTMLButtonElement>('#save');
const status = document.querySelector<HTMLElement>('#status');

if (!saveButton || !status) throw new Error('Popup controls are missing.');

const api = getExtensionApi();
let readyContext:
  | {
      pwaOrigin: string;
      tabId: number;
    }
  | undefined;

saveButton.disabled = true;
status.textContent = 'Loading extension context…';
void Promise.all([getSettings(), api.tabs.query({ active: true, currentWindow: true })])
  .then(([settings, tabs]) => {
    const [tab] = tabs;
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      throw new Error('Open an HTTP(S) page before saving.');
    }
    readyContext = { pwaOrigin: originPattern(settings.pwaUrl), tabId: tab.id };
    saveButton.disabled = false;
    status.textContent = 'Ready.';
  })
  .catch((cause: unknown) => {
    status.textContent = cause instanceof Error ? cause.message : String(cause);
  });

saveButton.addEventListener('click', async () => {
  if (!readyContext) return;
  const context = readyContext;
  saveButton.disabled = true;
  status.textContent = 'Checking permission to connect to PostKeeper…';
  try {
    // Keep the permission request in the original click task for Firefox activation.
    const allowed = await api.permissions.request({ origins: [context.pwaOrigin] });
    if (!allowed) {
      throw new Error('Permission to connect to the configured PostKeeper origin was denied.');
    }
    status.textContent = 'Capturing the rendered page and available images…';
    const response = (await api.runtime.sendMessage({
      type: 'postkeeper:save-page',
      tabId: context.tabId,
    } satisfies RuntimeRequest)) as { ok?: boolean; message?: string; error?: string } | undefined;
    status.textContent = response?.ok
      ? (response.message ?? 'Capture queued.')
      : (response?.error ?? 'Capture failed.');
  } catch (cause: unknown) {
    status.textContent = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saveButton.disabled = false;
  }
});
