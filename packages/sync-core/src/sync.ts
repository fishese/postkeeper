import {
  decodeEncryptedObjectEnvelope,
  decodeWrappedMasterKeyEnvelope,
  decryptRemoteObject,
  encodeEnvelope,
  encryptRemoteObject,
  recoverMasterKey,
  remoteBlobId,
  verifyRecoveryKey,
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
export const REMOTE_LIBRARY_METADATA_PATH = 'library-metadata/root.json';

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

function operationPath(operation: SyncOperation): string {
  return `devices/${operation.deviceId}/operations/${String(operation.sequence).padStart(16, '0')}.json`;
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
  if (!(await verifyRecoveryKey(keys.recoveryKey, keys.wrappedMasterKey))) {
    throw new Error('Recovery key verification failed before remote initialization.');
  }
  const encoded = encodeEnvelope(keys.wrappedMasterKey);
  const result = await retryProviderCall(
    () => provider.putImmutable(REMOTE_LIBRARY_METADATA_PATH, encoded),
    retryOptions,
  );
  if (result.status === 'existing') {
    const existing = decodeWrappedMasterKeyEnvelope(
      (await retryProviderCall(() => provider.get(REMOTE_LIBRARY_METADATA_PATH), retryOptions))
        .bytes,
    );
    if (existing.libraryId !== keys.libraryId) {
      throw new SyncProviderError(
        'conflict',
        'This provider already contains a different PostKeeper library.',
      );
    }
    if (!(await verifyRecoveryKey(keys.recoveryKey, existing))) {
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
}> {
  const remote = await retryProviderCall(
    () => provider.get(REMOTE_LIBRARY_METADATA_PATH),
    retryOptions,
  );
  const wrappedMasterKey = decodeWrappedMasterKeyEnvelope(remote.bytes);
  const masterKey = await recoverMasterKey(recoveryKey, wrappedMasterKey);
  return { masterKey, libraryId: wrappedMasterKey.libraryId, wrappedMasterKey };
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

export async function downloadRemoteOperations(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  retryOptions?: RetryOptions,
): Promise<SyncOperation[]> {
  const paths = await retryProviderCall(() => listEveryObject(provider, 'devices/'), retryOptions);
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
    if (operationPath(operation) !== path) {
      throw new Error('Remote operation was stored at an invalid path.');
    }
    operations.push(operation);
  }
  return mergeOperationLogs(operations);
}

export async function syncOperationLog(
  provider: SyncObjectStore,
  masterKey: Uint8Array,
  libraryId: string,
  localOperations: readonly SyncOperation[],
  retryOptions?: RetryOptions,
): Promise<SyncRunResult> {
  const local = mergeOperationLogs(localOperations);
  let uploaded = 0;
  for (const operation of local) {
    const path = operationPath(operation);
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
  }
  const remoteOperations = await downloadRemoteOperations(
    provider,
    masterKey,
    libraryId,
    retryOptions,
  );
  const operations = mergeOperationLogs(local, remoteOperations);
  const materialized = materializeOperations(operations);
  return {
    state: materialized.conflicts.length ? 'conflict' : 'synced',
    pending: 0,
    uploaded,
    downloaded: remoteOperations.filter(
      (remote) => !local.some((operation) => operation.operationId === remote.operationId),
    ).length,
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
): Promise<string> {
  const id = await remoteBlobId(masterKey, plaintextHash);
  const path = `blobs/${id}`;
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
): Promise<Uint8Array> {
  if (!path.startsWith('blobs/')) throw new Error('Invalid remote blob path.');
  const remote = await retryProviderCall(() => provider.get(path), retryOptions);
  return decryptRemoteObject(
    masterKey,
    libraryId,
    path,
    decodeEncryptedObjectEnvelope(remote.bytes),
  );
}
