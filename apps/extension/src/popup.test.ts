// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.innerHTML = '<button id="save">Save current page</button><p id="status"></p>';
});

test('requests the PWA permission synchronously from the popup click', async () => {
  let resolvePermission: ((allowed: boolean) => void) | undefined;
  const requestPermission = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        resolvePermission = resolve;
      }),
  );
  const sendMessage = vi.fn((message: { type?: string }) =>
    Promise.resolve(
      message.type === 'postkeeper:prepare-page'
        ? { ok: true, assetOrigins: ['https://cdn.example/*'] }
        : { ok: true, message: 'Capture queued.' },
    ),
  );

  vi.stubGlobal('browser', {
    permissions: { request: requestPermission },
    runtime: { sendMessage },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ pwaUrl: 'http://127.0.0.1:4173/' }),
      },
    },
    tabs: {
      query: vi
        .fn()
        .mockResolvedValue([{ id: 7, url: 'http://127.0.0.1:4174/authenticated.html' }]),
    },
  });

  await import('./popup');
  const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  await vi.waitFor(() => expect(saveButton.disabled).toBe(false));

  saveButton.click();

  expect(requestPermission).toHaveBeenCalledOnce();
  expect(requestPermission).toHaveBeenCalledWith({
    origins: ['http://127.0.0.1/*', 'https://cdn.example/*'],
  });
  expect(sendMessage).toHaveBeenCalledTimes(1);

  resolvePermission?.(true);
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
  expect(sendMessage).toHaveBeenLastCalledWith({
    type: 'postkeeper:save-page',
    tabId: 7,
    tabUrl: 'http://127.0.0.1:4174/authenticated.html',
    replaceSenderTab: false,
  });
  await vi.waitFor(() => expect(status.textContent).toBe('Capture queued.'));
});

test.each([{ tabs: [] }, { tabs: [{ id: 7, url: 'chrome://newtab/' }] }])(
  'reports an unavailable capture tab instead of getting stuck loading: $tabs',
  async ({ tabs }) => {
    vi.stubGlobal('browser', {
      storage: { local: { get: vi.fn().mockResolvedValue({}) } },
      tabs: { query: vi.fn().mockResolvedValue(tabs) },
    });
    await import('./popup');
    await vi.waitFor(() =>
      expect(document.querySelector('#status')?.textContent).toBe(
        'Open an HTTP(S) page before saving.',
      ),
    );
    expect(document.querySelector<HTMLButtonElement>('#save')!.disabled).toBe(true);
  },
);

test('shows a missing background response as a retryable capture failure', async () => {
  vi.stubGlobal('browser', {
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://example.com/' }]) },
    permissions: { request: vi.fn().mockResolvedValue(true) },
    runtime: {
      sendMessage: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, assetOrigins: [] })
        .mockResolvedValueOnce(undefined),
    },
  });
  await import('./popup');
  const button = document.querySelector<HTMLButtonElement>('#save')!;
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  button.click();
  await vi.waitFor(() =>
    expect(document.querySelector('#status')?.textContent).toBe('Capture failed.'),
  );
  expect(button.disabled).toBe(false);
});

test('mobile window failure offers an explicit source picker and requests only chosen hosts', async () => {
  const request = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('browser', {
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
    tabs: {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error('could not find an active window'))
        .mockResolvedValue([
          { id: 4, url: 'chrome-extension://test/popup.html' },
          { id: 7, url: 'https://example.com/article' },
          { id: 8, url: 'https://other.test/' },
        ]),
    },
    permissions: { request },
    runtime: { sendMessage },
  });
  await import('./popup');
  await vi.waitFor(() => expect(document.querySelector('select')).not.toBeNull());
  const select = document.querySelector('select')!;
  const button = document.querySelector<HTMLButtonElement>('#save')!;
  expect(button.disabled).toBe(true);
  expect(select.options).toHaveLength(3);
  select.value = '7';
  select.dispatchEvent(new Event('change'));
  button.click();
  expect(request).toHaveBeenCalledWith({
    origins: ['https://keep.fishese.cc/*', 'https://example.com/*'],
  });
  await vi.waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'postkeeper:save-page',
      tabId: 7,
      tabUrl: 'https://example.com/article',
      replaceSenderTab: false,
    }),
  );
});

test('action-source pages resolve their source without querying for an active window', async () => {
  window.history.replaceState({}, '', '?source=12345678-1234-1234-1234-123456789abc');
  const query = vi.fn().mockRejectedValue(new Error('could not find an active window'));
  const sendMessage = vi.fn((message: { type?: string }) =>
    Promise.resolve(
      message.type === 'postkeeper:action-source'
        ? {
            ok: true,
            assetOrigins: ['https://i.redd.it/*'],
            tabId: 12,
            tabUrl: 'https://www.reddit.com/r/example/comments/post/',
          }
        : { ok: true, assetOrigins: ['https://i.redd.it/*'] },
    ),
  );
  vi.stubGlobal('browser', {
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
    tabs: { query },
    runtime: { sendMessage },
  });

  await import('./popup');
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLButtonElement>('#save')!.disabled).toBe(false),
  );
  expect(query).not.toHaveBeenCalled();
  expect(sendMessage).toHaveBeenNthCalledWith(1, {
    type: 'postkeeper:action-source',
    token: '12345678-1234-1234-1234-123456789abc',
  });
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

test('Chromium action page keeps the source tab and replaces itself with PostKeeper', async () => {
  window.history.replaceState(null, '', '/popup.html?source=00000000-0000-4000-8000-000000000042');
  const request = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn((message: { type?: string }) =>
    Promise.resolve(
      message.type === 'postkeeper:action-source'
        ? { ok: true, tabId: 42, tabUrl: 'https://example.com/article' }
        : message.type === 'postkeeper:prepare-page'
          ? { ok: true, assetOrigins: [] }
          : { ok: true, message: 'Capture queued.' },
    ),
  );
  vi.stubGlobal('browser', {
    storage: { local: { get: vi.fn().mockResolvedValue({}) } },
    tabs: { query: vi.fn().mockRejectedValue(new Error('could not find an active window')) },
    permissions: { request },
    runtime: { sendMessage },
  });

  await import('./popup');
  const button = document.querySelector<HTMLButtonElement>('#save')!;
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  button.click();

  expect(request).toHaveBeenCalledWith({ origins: ['https://keep.fishese.cc/*'] });
  await vi.waitFor(() =>
    expect(sendMessage).toHaveBeenLastCalledWith({
      actionToken: '00000000-0000-4000-8000-000000000042',
      type: 'postkeeper:save-page',
      tabId: 42,
      tabUrl: 'https://example.com/article',
      replaceSenderTab: true,
    }),
  );
});
