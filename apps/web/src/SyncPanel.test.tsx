// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import type { Library } from '@postkeeper/local-store';
import type { GoogleIdentityProvider } from '@postkeeper/sync-google-drive';
import { loadGoogleIdentityServices } from './googleIdentity';
import { SyncPanel } from './SyncPanel';

vi.mock('./googleIdentity', () => ({ loadGoogleIdentityServices: vi.fn() }));
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('prepares Google separately and requests the popup synchronously on the next click', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const requestAccessToken = vi.fn();
  const identity: GoogleIdentityProvider = {
    accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken }), revoke: vi.fn() } },
  };
  vi.mocked(loadGoogleIdentityServices).mockResolvedValue(identity);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<SyncPanel library={{} as Library} onLibraryChanged={vi.fn()} />);
  });
  expect(loadGoogleIdentityServices).not.toHaveBeenCalled();
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === text)!;
  await act(async () => button('Load Google sign-in').click());
  expect(requestAccessToken).not.toHaveBeenCalled();
  act(() => {
    button('Connect Google Drive').click();
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });
});
