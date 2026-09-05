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
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, message: 'Capture queued.' });

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
  expect(requestPermission).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
  expect(sendMessage).not.toHaveBeenCalled();

  resolvePermission?.(true);
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
  expect(sendMessage).toHaveBeenCalledWith({ type: 'postkeeper:save-page', tabId: 7 });
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
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
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
