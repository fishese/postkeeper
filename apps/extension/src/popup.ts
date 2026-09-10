import { getExtensionApi, getSettings, originPattern } from './api';
import type { RuntimeRequest } from './messages';

const saveButton = document.querySelector<HTMLButtonElement>('#save');
const status = document.querySelector<HTMLElement>('#status');

if (!saveButton || !status) throw new Error('Popup controls are missing.');
const saveControl = saveButton;
const statusControl = status;

const api = getExtensionApi();
let readyContext:
  | {
      assetOrigins: string[];
      pwaOrigin: string;
      replaceSenderTab: boolean;
      tabId: number;
      tabUrl: string;
      actionToken?: string;
      sourceOrigin?: string;
    }
  | undefined;

type SourceTab = {
  id: number;
  url: string;
  replaceSenderTab: boolean;
  requiresSourcePermission: boolean;
};

async function prepareSource(settings: { pwaUrl: string }, source: SourceTab): Promise<void> {
  statusControl.textContent = 'Inspecting the rendered page…';
  const response = (await api.runtime.sendMessage({
    type: 'postkeeper:prepare-page',
    tabId: source.id,
    tabUrl: source.url,
  } satisfies RuntimeRequest)) as
    { ok?: boolean; assetOrigins?: string[]; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? 'Page inspection failed.');
  readyContext = {
    assetOrigins: response.assetOrigins ?? [],
    pwaOrigin: originPattern(settings.pwaUrl),
    replaceSenderTab: source.replaceSenderTab,
    tabId: source.id,
    tabUrl: source.url,
    ...(source.requiresSourcePermission ? { sourceOrigin: originPattern(source.url) } : {}),
  };
  saveControl.disabled = false;
  statusControl.textContent = 'Ready.';
}

saveButton.disabled = true;
status.textContent = 'Loading extension context…';
void getSettings()
  .then(async (settings) => {
    const parameters = new URLSearchParams(window.location.search);
    const actionToken = parameters.get('source');
    const actionError = parameters.get('error');
    if (actionError) throw new Error(actionError);
    if (actionToken) {
      const source = (await api.runtime.sendMessage({
        type: 'postkeeper:action-source',
        token: actionToken,
      } satisfies RuntimeRequest)) as
        | {
            ok?: boolean;
            assetOrigins?: string[];
            tabId?: number;
            tabUrl?: string;
            error?: string;
          }
        | undefined;
      if (!source?.ok || source.tabId === undefined || !source.tabUrl) {
        throw new Error(source?.error ?? 'The source page reference is unavailable.');
      }
      readyContext = {
        actionToken,
        assetOrigins: source.assetOrigins ?? [],
        pwaOrigin: originPattern(settings.pwaUrl),
        replaceSenderTab: true,
        tabId: source.tabId,
        tabUrl: source.tabUrl,
      };
      saveControl.disabled = false;
      statusControl.textContent = 'Ready.';
      return;
    }
    const tabs = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
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
        readyContext = undefined;
        saveButton.disabled = true;
        if (chosen) {
          readyContext = {
            assetOrigins: [],
            pwaOrigin: originPattern(settings.pwaUrl),
            replaceSenderTab: false,
            tabId: chosen.id!,
            tabUrl: chosen.url!,
            sourceOrigin: originPattern(chosen.url!),
          };
          saveButton.disabled = false;
          status.textContent = 'Ready.';
        }
      });
      label.append(select);
      saveButton.before(label);
      status.textContent =
        'This browser opened the extension separately. Select your original page above.';
      return;
    }
    await prepareSource(settings, {
      id: tab.id,
      url: tab.url,
      replaceSenderTab: false,
      requiresSourcePermission: false,
    });
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
        ...new Set([
          context.pwaOrigin,
          ...(context.sourceOrigin ? [context.sourceOrigin] : []),
          ...context.assetOrigins,
        ]),
      ],
    });
    if (!allowed) {
      throw new Error('Permission to connect to the configured PostKeeper origin was denied.');
    }
    status.textContent = 'Capturing the rendered page and available images…';
    const response = (await api.runtime.sendMessage({
      type: 'postkeeper:save-page',
      ...(context.actionToken ? { actionToken: context.actionToken } : {}),
      tabId: context.tabId,
      tabUrl: context.tabUrl,
      replaceSenderTab: context.replaceSenderTab,
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
