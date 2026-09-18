import { describe, expect, it } from 'vitest';
import {
  appendOperation,
  createDeviceOperationLog,
  createLibraryKeyMaterial,
  downloadEncryptedBlob,
  initializeRemoteLibrary,
  restoreLibraryKey,
  syncOperationLog,
  uploadEncryptedBlob,
} from '@postkeeper/sync-core';
import { PocketBasePasswordAuthorizer } from './pocketbase';
import { HttpSyncObjectStore } from './store';

const endpoint = process.env.POSTKEEPER_POCKETBASE_TEST_URL;
const identity = process.env.POSTKEEPER_POCKETBASE_TEST_IDENTITY;
const password = process.env.POSTKEEPER_POCKETBASE_TEST_PASSWORD;

describe.skipIf(!endpoint || !identity || !password)('live PocketBase adapter', () => {
  it('authenticates, synchronizes, and restores encrypted operations', async () => {
    const auth = new PocketBasePasswordAuthorizer({ endpoint: endpoint! });
    await auth.connect(identity!, password!);
    const provider = new HttpSyncObjectStore({
      endpoint: endpoint!,
      accessToken: () => auth.token(),
    });
    const keys = await createLibraryKeyMaterial();
    await initializeRemoteLibrary(provider, keys);
    const log = createDeviceOperationLog('live-device');
    appendOperation(log, {
      kind: 'entity.field.set',
      entityType: 'article',
      entityId: 'live-article',
      field: 'title',
      value: 'Live PocketBase encrypted title',
    });
    const blob = new TextEncoder().encode('Live PocketBase encrypted body');
    const blobPath = await uploadEncryptedBlob(
      provider,
      keys.masterKey,
      keys.libraryId,
      'b'.repeat(64),
      blob,
    );
    await syncOperationLog(provider, keys.masterKey, keys.libraryId, log.operations);
    const restored = await restoreLibraryKey(provider, keys.recoveryKey);
    const clean = await syncOperationLog(provider, restored.masterKey, restored.libraryId, []);
    expect(clean.materialized.articles['live-article']?.values.title).toBe(
      'Live PocketBase encrypted title',
    );
    expect(
      await downloadEncryptedBlob(provider, restored.masterKey, restored.libraryId, blobPath),
    ).toEqual(blob);
    const remoteBytes: Uint8Array[] = [];
    let cursor: string | undefined;
    do {
      const page = await provider.list('', cursor);
      for (const object of page.objects) remoteBytes.push((await provider.get(object.path)).bytes);
      cursor = page.continuationToken;
    } while (cursor);
    const opaqueText = remoteBytes.map((bytes) => new TextDecoder().decode(bytes)).join('\n');
    expect(opaqueText).not.toContain('Live PocketBase encrypted title');
    expect(opaqueText).not.toContain('Live PocketBase encrypted body');
    expect(opaqueText).not.toContain('b'.repeat(64));
    auth.disconnect();
  });
});
