import { describe, expect, it } from 'vitest';
import {
  appendOperation,
  createDeviceOperationLog,
  createLibraryKeyMaterial,
  downloadEncryptedBlob,
  initializeRemoteLibrary,
  MemorySyncObjectStore,
  restoreLibraryKey,
  remoteLibraryMetadataPath,
  syncOperationLog,
  uploadEncryptedBlob,
} from './index';

describe('sync integration', () => {
  it('converges two clients after independent offline edits and restores a clean client', async () => {
    const remote = new MemorySyncObjectStore(1);
    const keys = await createLibraryKeyMaterial();
    await initializeRemoteLibrary(remote, keys);
    const alpha = createDeviceOperationLog('alpha');
    const beta = createDeviceOperationLog('beta');
    appendOperation(
      alpha,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'article',
        field: 'title',
        value: 'Offline',
      },
      '2026-09-01T01:00:00.000Z',
    );
    appendOperation(
      beta,
      {
        kind: 'entity.field.set',
        entityType: 'article',
        entityId: 'article',
        field: 'favorite',
        value: true,
      },
      '2026-09-01T01:01:00.000Z',
    );

    await syncOperationLog(remote, keys.masterKey, keys.libraryId, alpha.operations);
    const betaResult = await syncOperationLog(
      remote,
      keys.masterKey,
      keys.libraryId,
      beta.operations,
    );
    const alphaResult = await syncOperationLog(
      remote,
      keys.masterKey,
      keys.libraryId,
      alpha.operations,
    );
    expect(alphaResult.materialized).toEqual(betaResult.materialized);
    expect(alphaResult.materialized.articles.article?.values).toEqual({
      title: 'Offline',
      favorite: true,
    });

    const restored = await restoreLibraryKey(remote, keys.recoveryKey);
    const cleanResult = await syncOperationLog(remote, restored.masterKey, restored.libraryId, []);
    expect(cleanResult.materialized).toEqual(alphaResult.materialized);
  });

  it('safely repeats an interrupted immutable upload', async () => {
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    await initializeRemoteLibrary(remote, keys);
    const log = createDeviceOperationLog('device');
    appendOperation(log, {
      kind: 'entity.field.set',
      entityType: 'article',
      entityId: 'a',
      field: 'title',
      value: 'kept',
    });
    remote.failAfterWrites(0);
    const result = await syncOperationLog(remote, keys.masterKey, keys.libraryId, log.operations, {
      sleep: async () => undefined,
    });
    expect(result.materialized.articles.a?.values.title).toBe('kept');
    const repeated = await syncOperationLog(remote, keys.masterKey, keys.libraryId, log.operations);
    expect(repeated.operations).toHaveLength(1);
  });

  it('round-trips selected encrypted content without exposing the plaintext hash', async () => {
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    const bytes = new TextEncoder().encode('<article>private body</article>');
    const hash = 'f'.repeat(64);
    const path = await uploadEncryptedBlob(remote, keys.masterKey, keys.libraryId, hash, bytes);
    expect(path).not.toContain(hash);
    expect(await downloadEncryptedBlob(remote, keys.masterKey, keys.libraryId, path)).toEqual(
      bytes,
    );
    expect(new TextDecoder().decode((await remote.get(path)).bytes)).not.toContain('private body');
  });

  it('rejects a damaged existing recovery envelope before uploading objects', async () => {
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    await initializeRemoteLibrary(remote, keys);
    const metadataPath = remoteLibraryMetadataPath(keys.libraryId);
    const current = await remote.get(metadataPath);
    const damaged = JSON.parse(new TextDecoder().decode(current.bytes)) as {
      cipher: { ciphertext: string };
    };
    const last = damaged.cipher.ciphertext.at(-1);
    damaged.cipher.ciphertext = `${damaged.cipher.ciphertext.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
    await remote.putConditional(
      metadataPath,
      new TextEncoder().encode(JSON.stringify(damaged)),
      current.etag,
    );
    await expect(initializeRemoteLibrary(remote, keys)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('keeps legacy pk1 libraries on their original root object layout', async () => {
    const remote = new MemorySyncObjectStore();
    const created = await createLibraryKeyMaterial();
    const legacyRecovery = `pk1_${created.recoveryKey.split('.')[1]}`;
    const legacy = { ...created, recoveryKey: legacyRecovery, remoteLayout: 'legacy' as const };
    await initializeRemoteLibrary(remote, legacy);
    const log = createDeviceOperationLog('legacy-device');
    appendOperation(log, {
      kind: 'entity.field.set',
      entityType: 'article',
      entityId: 'legacy-article',
      field: 'title',
      value: 'Legacy data',
    });
    await syncOperationLog(
      remote,
      legacy.masterKey,
      legacy.libraryId,
      log.operations,
      undefined,
      'legacy',
    );
    expect((await remote.list('devices/')).objects).toHaveLength(1);
    expect((await remote.list('libraries/')).objects).toHaveLength(0);

    const restored = await restoreLibraryKey(remote, legacyRecovery);
    expect(restored.remoteLayout).toBe('legacy');
    const result = await syncOperationLog(
      remote,
      restored.masterKey,
      restored.libraryId,
      [],
      undefined,
      restored.remoteLayout,
    );
    expect(result.materialized.articles['legacy-article']?.values.title).toBe('Legacy data');
  });
});
