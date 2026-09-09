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
      sourceOrigin?: string;
    }
  | undefined;

saveButton.disabled = true;
status.textContent = 'Loading extension context…';
void Promise.all([
  getSettings(),
  api.tabs.query({ active: true, currentWindow: true }).catch(() => []),
])
  .then(async ([settings, tabs]) => {
    const [tab] = tabs;
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      const candidates = (await api.tabs.query({})).filter(
        (candidate) =>
          candidate.id !== undefined && candidate.url && /^https?:/.test(candidate.url),
      );
      if (!candidates.length) throw new Error('Open an HTTP(S) page before saving.');
      const label = document.createElement('label');
      label.textContent = 'Choose the page to save ';
      const select = document.createElement('select');
      select.style.maxWidth = '100%';
      select.append(new Option('Select an open page…', ''));
      for (const candidate of candidates) {
        select.append(new Option(candidate.url!, String(candidate.id)));
      }
      select.addEventListener('change', () => {
        const chosen = candidates.find((candidate) => String(candidate.id) === select.value);
        readyContext = chosen
          ? {
              pwaOrigin: originPattern(settings.pwaUrl),
              tabId: chosen.id!,
              sourceOrigin: originPattern(chosen.url!),
            }
          : undefined;
        saveButton.disabled = !readyContext;
      });
      label.append(select);
      saveButton.before(label);
      status.textContent =
        'This browser opened the extension separately. Select your original page above.';
      return;
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
    const allowed = await api.permissions.request({
      origins: [
        ...new Set([context.pwaOrigin, ...(context.sourceOrigin ? [context.sourceOrigin] : [])]),
      ],
    });
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
