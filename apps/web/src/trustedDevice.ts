import type { LibraryKeyMaterial, WrappedMasterKeyEnvelope } from '@postkeeper/sync-core';

const DATABASE = 'postkeeper-trusted-device';
const STORE = 'records';
const DEVICE_KEY = 'device-key';
const SESSION = 'pocketbase-session';
const AAD = new TextEncoder().encode('postkeeper-trusted-device-v1');

type StoredRecord = { id: string; value: unknown };

export type TrustedPocketBaseSession = {
  endpoint: string;
  identity: string;
  token: string;
  keys: Omit<LibraryKeyMaterial, 'recoveryKey'> | null;
};

type SerializedSession = {
  endpoint: string;
  identity: string;
  token: string;
  keys: {
    masterKey: string;
    libraryId: string;
    remoteLayout: LibraryKeyMaterial['remoteLayout'];
    wrappedMasterKey: WrappedMasterKeyEnvelope;
  } | null;
};

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Credential transaction aborted.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) {
        opening.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deviceKey(database: IDBDatabase): Promise<CryptoKey> {
  const read = database.transaction(STORE);
  const existing = (await request(read.objectStore(STORE).get(DEVICE_KEY))) as
    StoredRecord | undefined;
  await done(read);
  if (existing?.value) return existing.value as CryptoKey;

  const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const write = database.transaction(STORE, 'readwrite');
  write.objectStore(STORE).put({ id: DEVICE_KEY, value: generated } satisfies StoredRecord);
  await done(write);
  return generated;
}

export async function saveTrustedPocketBaseSession(value: TrustedPocketBaseSession): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    const key = await deviceKey(database);
    const serialized: SerializedSession = {
      endpoint: value.endpoint,
      identity: value.identity,
      token: value.token,
      keys: value.keys
        ? {
            masterKey: encode(value.keys.masterKey),
            libraryId: value.keys.libraryId,
            remoteLayout: value.keys.remoteLayout,
            wrappedMasterKey: value.keys.wrappedMasterKey,
          }
        : null,
    };
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: AAD },
      key,
      new TextEncoder().encode(JSON.stringify(serialized)),
    );
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({
      id: SESSION,
      value: { version: 1, nonce: encode(nonce), ciphertext: encode(new Uint8Array(ciphertext)) },
    } satisfies StoredRecord);
    await done(transaction);
  } finally {
    database.close();
  }
}

export async function loadTrustedPocketBaseSession(): Promise<TrustedPocketBaseSession | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE);
    const stored = (await request(transaction.objectStore(STORE).get(SESSION))) as
      StoredRecord | undefined;
    await done(transaction);
    if (!stored) return null;
    const envelope = stored.value as { version?: unknown; nonce?: unknown; ciphertext?: unknown };
    if (
      envelope.version !== 1 ||
      typeof envelope.nonce !== 'string' ||
      typeof envelope.ciphertext !== 'string'
    ) {
      throw new Error('Saved PocketBase session is invalid.');
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(envelope.nonce), additionalData: AAD },
      await deviceKey(database),
      decode(envelope.ciphertext),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as SerializedSession;
    if (!parsed.endpoint || !parsed.identity || !parsed.token) {
      throw new Error('Saved PocketBase session is invalid.');
    }
    return {
      endpoint: parsed.endpoint,
      identity: parsed.identity,
      token: parsed.token,
      keys: parsed.keys
        ? {
            masterKey: decode(parsed.keys.masterKey),
            libraryId: parsed.keys.libraryId,
            remoteLayout: parsed.keys.remoteLayout,
            wrappedMasterKey: parsed.keys.wrappedMasterKey,
          }
        : null,
    };
  } finally {
    database.close();
  }
}

export async function clearTrustedPocketBaseSession(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(SESSION);
    transaction.objectStore(STORE).delete(DEVICE_KEY);
    await done(transaction);
  } finally {
    database.close();
  }
}
