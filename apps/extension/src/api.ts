export type ExtensionSettings = { pwaUrl: string };

export const DEFAULT_PWA_URL = 'https://keep.fishese.cc/';

export function getExtensionApi(): PostKeeperExtensionApi {
  const api =
    typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : undefined;
  if (!api) throw new Error('WebExtension APIs are unavailable.');
  return api;
}

export function normalizePwaUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid PostKeeper URL.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('PostKeeper must use HTTPS, except on localhost.');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.href;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await getExtensionApi().storage.local.get('pwaUrl');
  return {
    pwaUrl: normalizePwaUrl(typeof stored.pwaUrl === 'string' ? stored.pwaUrl : DEFAULT_PWA_URL),
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await getExtensionApi().storage.local.set({ pwaUrl: normalizePwaUrl(settings.pwaUrl) });
}

export async function injectScript(tabId: number, file: string): Promise<void> {
  const api = getExtensionApi();
  if (api.scripting) {
    await api.scripting.executeScript({ target: { tabId }, files: [file] });
    return;
  }
  if (!api.tabs.executeScript) throw new Error('This browser cannot inject the capture script.');
  await api.tabs.executeScript(tabId, { file: `/${file}` });
}

export function originPattern(value: string): string {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}/*`;
}
