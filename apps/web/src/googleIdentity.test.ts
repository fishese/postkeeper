// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vitest';
import type { GoogleIdentityProvider } from '@postkeeper/sync-google-drive';
import { loadGoogleIdentityServices } from './googleIdentity';

afterEach(() => {
  document.getElementById('postkeeper-google-identity-services')?.remove();
  delete window.google;
  vi.useRealTimers();
});

const identity: GoogleIdentityProvider = {
  accounts: { oauth2: { initTokenClient: vi.fn(), revoke: vi.fn() } },
};

test('shares one script load and allows a fresh attempt after failure', async () => {
  const first = loadGoogleIdentityServices();
  expect(loadGoogleIdentityServices()).toBe(first);
  const failure = expect(first).rejects.toThrow(/could not be loaded/u);
  document.getElementById('postkeeper-google-identity-services')!.dispatchEvent(new Event('error'));
  await failure;
  expect(document.getElementById('postkeeper-google-identity-services')).toBeNull();

  const retry = loadGoogleIdentityServices();
  window.google = identity;
  document.getElementById('postkeeper-google-identity-services')!.dispatchEvent(new Event('load'));
  expect(await retry).toBe(identity);
  expect(await loadGoogleIdentityServices()).toBe(identity);
});

test('times out instead of leaving the connection button stuck', async () => {
  vi.useFakeTimers();
  const failure = expect(loadGoogleIdentityServices()).rejects.toThrow(/timed out/u);
  await vi.advanceTimersByTimeAsync(20_000);
  await failure;
  expect(document.getElementById('postkeeper-google-identity-services')).toBeNull();
});

test('rejects a loaded script that did not initialize the Google API', async () => {
  const failure = expect(loadGoogleIdentityServices()).rejects.toThrow(/did not initialize/u);
  document.getElementById('postkeeper-google-identity-services')!.dispatchEvent(new Event('load'));
  await failure;
  expect(document.getElementById('postkeeper-google-identity-services')).toBeNull();
});
