// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createLibraryKeyMaterial } from '@postkeeper/sync-core';
import {
  clearTrustedPocketBaseSession,
  loadTrustedPocketBaseSession,
  saveTrustedPocketBaseSession,
} from './trustedDevice';

afterEach(async () => {
  await clearTrustedPocketBaseSession();
});

describe('trusted PocketBase device session', () => {
  it('restores an encrypted token and wrapped master key without retaining the recovery key', async () => {
    const created = await createLibraryKeyMaterial();
    await saveTrustedPocketBaseSession({
      endpoint: 'https://nas.example.test/',
      identity: 'person@example.test',
      token: 'remembered-token',
      keys: {
        masterKey: created.masterKey,
        libraryId: created.libraryId,
        remoteLayout: created.remoteLayout,
        wrappedMasterKey: created.wrappedMasterKey,
      },
    });

    const restored = await loadTrustedPocketBaseSession();
    expect(restored).toMatchObject({
      endpoint: 'https://nas.example.test/',
      identity: 'person@example.test',
      token: 'remembered-token',
    });
    expect(restored?.keys?.masterKey).toEqual(created.masterKey);
    expect(JSON.stringify(restored)).not.toContain(created.recoveryKey);

    await clearTrustedPocketBaseSession();
    expect(await loadTrustedPocketBaseSession()).toBeNull();
  });
});
