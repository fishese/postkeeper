import { requiredSyncBlobs, type Library } from '@postkeeper/local-store';
import {
  downloadEncryptedBlob,
  initializeRemoteLibrary,
  remoteBlobId,
  restoreLibraryKey,
  syncOperationLog,
  uploadEncryptedBlob,
  type LibraryKeyMaterial,
  type RetryOptions,
  type SyncObjectStore,
  type SyncRunResult,
} from '@postkeeper/sync-core';

export type LibrarySyncResult = SyncRunResult & { restoredBlobs: number };

async function restoreMissingBlobs(
  library: Library,
  provider: SyncObjectStore,
  keys: Pick<LibraryKeyMaterial, 'masterKey' | 'libraryId'>,
  result: SyncRunResult,
  retryOptions?: RetryOptions,
): Promise<number> {
  let restored = 0;
  for (const blob of requiredSyncBlobs(result.materialized)) {
    if (await library.hasSyncBlob(blob.id)) continue;
    const path = `blobs/${await remoteBlobId(keys.masterKey, blob.id)}`;
    const bytes = await downloadEncryptedBlob(
      provider,
      keys.masterKey,
      keys.libraryId,
      path,
      retryOptions,
    );
    await library.importSyncedBlob(blob.id, blob.mediaType, bytes);
    restored += 1;
  }
  return restored;
}

export async function synchronizeLibrary(
  library: Library,
  provider: SyncObjectStore,
  keys: LibraryKeyMaterial,
  retryOptions?: RetryOptions,
): Promise<LibrarySyncResult> {
  const associatedLibrary = await library.getSyncLibraryId();
  if (associatedLibrary && associatedLibrary !== keys.libraryId) {
    throw new Error('This local library is associated with a different encrypted sync library.');
  }
  await initializeRemoteLibrary(provider, keys, retryOptions);
  await library.associateSyncLibrary(keys.libraryId);
  const operations = await library.prepareSyncOperations();
  for (const blob of await library.listSyncBlobs()) {
    await uploadEncryptedBlob(
      provider,
      keys.masterKey,
      keys.libraryId,
      blob.id,
      blob.bytes,
      retryOptions,
    );
  }
  const result = await syncOperationLog(
    provider,
    keys.masterKey,
    keys.libraryId,
    operations,
    retryOptions,
  );
  if (result.state === 'conflict') {
    await library.storeSyncOperations(result.operations);
    return { ...result, restoredBlobs: 0 };
  }
  const restoredBlobs = await restoreMissingBlobs(library, provider, keys, result, retryOptions);
  await library.applySyncState(result.materialized, result.operations);
  return { ...result, restoredBlobs };
}

export async function restoreLibraryFromRemote(
  library: Library,
  provider: SyncObjectStore,
  recoveryKey: string,
  retryOptions?: RetryOptions,
): Promise<{ keys: LibraryKeyMaterial; result: LibrarySyncResult }> {
  const restored = await restoreLibraryKey(provider, recoveryKey, retryOptions);
  const keys: LibraryKeyMaterial = { ...restored, recoveryKey };
  const associatedLibrary = await library.getSyncLibraryId();
  if (associatedLibrary && associatedLibrary !== keys.libraryId) {
    throw new Error('This local library is associated with a different encrypted sync library.');
  }
  if (!associatedLibrary) {
    const stats = await library.getStats();
    if (stats.articles > 0 || stats.snapshots > 0) {
      throw new Error(
        'Restore requires a clean local library. Start sync from this device instead of merging an unrelated library.',
      );
    }
  }
  // Unlocking an existing device must upload newly captured blobs before their operations too.
  return { keys, result: await synchronizeLibrary(library, provider, keys, retryOptions) };
}
