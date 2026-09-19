import {
  decodeEncryptedObjectEnvelope,
  decodeWrappedMasterKeyEnvelope,
  decryptRemoteObject,
  encodeEnvelope,
  encryptRemoteObject,
  recoverMasterKey,
  recoveryKeyLibraryId,
  remoteBlobId,
  verifyRecoveryKey,
  verifyMasterKeyLibraryId,
  type LibraryKeyMaterial,
  type WrappedMasterKeyEnvelope,
} from './crypto';
import {
  assertSyncOperation,
  materializeOperations,
  mergeOperationLogs,
  type MaterializedSyncState,
  type SyncOperation,
} from './operations';
import { SyncProviderError, type SyncObjectStore } from './provider';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const LEGACY_REMOTE_LIBRARY_METADATA_PATH = 'library-metadata/root.json';

export function remoteLibraryMetadataPath(
  libraryId: string,
  layout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): string {
  return layout === 'legacy'
    ? LEGACY_REMOTE_LIBRARY_METADATA_PATH
    : `libraries/${libraryId}/library-metadata/root.json`;
}

export function remoteLibraryPrefix(
  libraryId: string,
  layout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): string {
  return layout === 'legacy' ? '' : `libraries/${libraryId}/`;
}

export type SyncRunResult = {
  state: 'synced' | 'conflict';
  pending: number;
  uploaded: number;
  downloaded: number;
  operations: SyncOperation[];
  materialized: MaterializedSyncState;
};

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function operationPath(
  libraryId: string,
  operation: SyncOperation,
  layout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): string {
  return `${remoteLibraryPrefix(libraryId, layout)}devices/${operation.deviceId}/operations/${String(operation.sequence).padStart(16, '0')}.json`;
}

async function retryProviderCall<T>(
  action: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (cause) {
      lastError = cause;
      if (
        !(cause instanceof SyncProviderError) ||
        cause.code !== 'retryable' ||
        attempt === maxAttempts
      ) {
        throw cause;
      }
      const delay = cause.retryAfterMs ?? baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function initializeRemoteLibrary(
  provider: SyncObjectStore,
  keys: LibraryKeyMaterial,
  retryOptions?: RetryOptions,
): Promise<void> {
  const validKeys = keys.recoveryKey
    ? await verifyRecoveryKey(keys.recoveryKey, keys.wrappedMasterKey)
    : await verifyMasterKeyLibraryId(keys.masterKey, keys.libraryId);
  if (!validKeys) {
    throw new Error('Recovery key verification failed before remote initialization.');
  }
  const path = remoteLibraryMetadataPath(keys.libraryId, keys.remoteLayout);
  const encoded = encodeEnvelope(keys.wrappedMasterKey);
  let existing: WrappedMasterKeyEnvelope | null = null;
  try {
    existing = decodeWrappedMasterKeyEnvelope(
      (await retryProviderCall(() => provider.get(path), retryOptions)).bytes,
    );
  } catch (cause) {
    if (!(cause instanceof SyncProviderError) || cause.code !== 'not-found') throw cause;
    const result = await retryProviderCall(
      () => provider.putImmutable(path, encoded),
      retryOptions,
    );
    // Another client may have initialized the same library after our missing-object read.
    if (result.status === 'existing') {
      existing = decodeWrappedMasterKeyEnvelope(
        (await retryProviderCall(() => provider.get(path), retryOptions)).bytes,
      );
    }
  }
  if (existing) {
    if (existing.libraryId !== keys.libraryId) {
      throw new SyncProviderError(
        'conflict',
        'This provider already contains a different PostKeeper library.',
      );
    }
    const validExisting = keys.recoveryKey
      ? await verifyRecoveryKey(keys.recoveryKey, existing)
      : JSON.stringify(existing) === JSON.stringify(keys.wrappedMasterKey);
    if (!validExisting) {
      throw new SyncProviderError(
        'conflict',
        'The remote recovery envelope is damaged or does not match this session.',
      );
    }
  }
}

export async function restoreLibraryKey(
  provider: SyncObjectStore,
  recoveryKey: string,
  retryOptions?: RetryOptions,
): Promise<{
  masterKey: Uint8Array;
  libraryId: string;
  wrappedMasterKey: WrappedMasterKeyEnvelope;
  remoteLayout: LibraryKeyMaterial['remoteLayout'];
}> {
  const locator = recoveryKeyLibraryId(recoveryKey);
  const remoteLayout = locator ? 'namespaced' : 'legacy';
  const path = remoteLibraryMetadataPath(locator ?? '', remoteLayout);
  const remote = await retryProviderCall(() => provider.get(path), retryOptions);
  const wrappedMasterKey = decodeWrappedMasterKeyEnvelope(remote.bytes);
  if (locator && wrappedMasterKey.libraryId !== locator) {
    throw new Error('Recovery key does not identify this encrypted library.');
  }
  const masterKey = await recoverMasterKey(recoveryKey, wrappedMasterKey);
  return { masterKey, libraryId: wrappedMasterKey.libraryId, wrappedMasterKey, remoteLayout };
}

async function listEveryObject(provider: SyncObjectStore, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  let continuationToken: string | undefined;
  const seenTokens = new Set<string>();
  do {
    const page = await provider.list(prefix, continuationToken);
    paths.push(...page.objects.map((object) => object.path));
    continuationToken = page.continuationToken;
    if (continuationToken) {
      if (seenTokens.has(continuationToken)) {
        throw new SyncProviderError('invalid-response', 'Provider repeated a continuation token.');
      }
      seenTokens.add(continuationToken);
    }
  } while (continuationToken);
  return [...new Set(paths)].sort();
}

export function listRemoteObjectPaths(
  provider: SyncObjectStore,
  prefix: string,
  retryOptions?: RetryOptions,
): Promise<string[]> {
  return retryProviderCall(() => listEveryObject(provider, prefix), retryOptions);
}

async function downloadOperationPaths(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  paths: readonly string[],
  retryOptions?: RetryOptions,
  remoteLayout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): Promise<SyncOperation[]> {
  const operations: SyncOperation[] = [];
  for (const path of paths) {
    const remote = await retryProviderCall(() => provider.get(path), retryOptions);
    const plaintext = await decryptRemoteObject(
      masterKey,
      libraryId,
      path,
      decodeEncryptedObjectEnvelope(remote.bytes),
    );
    const operation = JSON.parse(decoder.decode(plaintext)) as unknown;
    assertSyncOperation(operation);
    if (operationPath(libraryId, operation, remoteLayout) !== path) {
      throw new Error('Remote operation was stored at an invalid path.');
    }
    operations.push(operation);
  }
  return mergeOperationLogs(operations);
}

export async function downloadRemoteOperations(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  retryOptions?: RetryOptions,
  remoteLayout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): Promise<SyncOperation[]> {
  const paths = await listRemoteObjectPaths(
    provider,
    `${remoteLibraryPrefix(libraryId, remoteLayout)}devices/`,
    retryOptions,
  );
  return downloadOperationPaths(provider, masterKey, libraryId, paths, retryOptions, remoteLayout);
}

export async function syncOperationLog(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  localOperations: readonly SyncOperation[],
  retryOptions?: RetryOptions,
  remoteLayout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
  knownRemotePaths?: ReadonlySet<string>,
): Promise<SyncRunResult> {
  const local = mergeOperationLogs(localOperations);
  const operationPrefix = `${remoteLibraryPrefix(libraryId, remoteLayout)}devices/`;
  const remotePaths = knownRemotePaths
    ? new Set([...knownRemotePaths].filter((path) => path.startsWith(operationPrefix)))
    : new Set(await listRemoteObjectPaths(provider, operationPrefix, retryOptions));
  let uploaded = 0;
  for (const operation of local) {
    const path = operationPath(libraryId, operation, remoteLayout);
    if (remotePaths.has(path)) continue;
    const encrypted = encodeEnvelope(
      await encryptRemoteObject(
        masterKey,
        libraryId,
        path,
        encoder.encode(JSON.stringify(operation)),
      ),
    );
    const result = await retryProviderCall(
      () => provider.putImmutable(path, encrypted),
      retryOptions,
    );
    if (result.status === 'created') uploaded += 1;
    remotePaths.add(path);
  }
  const localPaths = new Set(
    local.map((operation) => operationPath(libraryId, operation, remoteLayout)),
  );
  const remoteOperations = await downloadOperationPaths(
    provider,
    masterKey,
    libraryId,
    [...remotePaths].filter((path) => !localPaths.has(path)).sort(),
    retryOptions,
    remoteLayout,
  );
  const operations = mergeOperationLogs(local, remoteOperations);
  const materialized = materializeOperations(operations);
  return {
    state: materialized.conflicts.length ? 'conflict' : 'synced',
    pending: 0,
    uploaded,
    downloaded: remoteOperations.length,
    operations,
    materialized,
  };
}

export async function uploadEncryptedBlob(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  plaintextHash: string,
  bytes: Uint8Array,
  retryOptions?: RetryOptions,
  remoteLayout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): Promise<string> {
  const id = await remoteBlobId(masterKey, plaintextHash);
  const path = `${remoteLibraryPrefix(libraryId, remoteLayout)}blobs/${id}`;
  const envelope = encodeEnvelope(await encryptRemoteObject(masterKey, libraryId, path, bytes));
  await retryProviderCall(() => provider.putImmutable(path, envelope), retryOptions);
  return path;
}

export async function downloadEncryptedBlob(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  path: string,
  retryOptions?: RetryOptions,
  remoteLayout: LibraryKeyMaterial['remoteLayout'] = 'namespaced',
): Promise<Uint8Array> {
  if (!path.startsWith(`${remoteLibraryPrefix(libraryId, remoteLayout)}blobs/`)) {
    throw new Error('Invalid remote blob path.');
  }
  const remote = await retryProviderCall(() => provider.get(path), retryOptions);
  return decryptRemoteObject(
    masterKey,
    libraryId,
    path,
    decodeEncryptedObjectEnvelope(remote.bytes),
  );
}
