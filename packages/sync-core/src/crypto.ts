const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const RECOVERY_KEY_PREFIX = 'pk1_';

export type LibraryKeyMaterial = {
  masterKey: Uint8Array;
  recoveryKey: string;
  libraryId: string;
  wrappedMasterKey: WrappedMasterKeyEnvelope;
};

export type WrappedMasterKeyEnvelope = {
  version: 1;
  kind: 'postkeeper-wrapped-master-key';
  libraryId: string;
  keyDerivation: {
    name: 'HKDF';
    hash: 'SHA-256';
    salt: string;
    info: 'postkeeper-recovery-wrap-v1';
  };
  cipher: {
    name: 'AES-GCM';
    nonce: string;
    ciphertext: string;
  };
};

export type EncryptedObjectEnvelope = {
  version: 1;
  kind: 'postkeeper-encrypted-object';
  libraryId: string;
  objectPath: string;
  cipher: {
    name: 'AES-GCM';
    nonce: string;
    ciphertext: string;
  };
};

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string, label: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error(`${label} is not valid base64url.`);
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`${label} is not valid base64url.`);
  }
}

async function deriveHkdfBits(
  input: Uint8Array,
  salt: Uint8Array,
  info: string,
  length = 256,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = await crypto.subtle.importKey('raw', ownedBytes(input), 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: ownedBytes(salt), info: encoder.encode(info) },
    source,
    length,
  );
  return new Uint8Array(bits);
}

async function importAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ownedBytes(bytes), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function importHmacKey(bytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ownedBytes(bytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function deriveLibraryId(masterKey: Uint8Array): Promise<string> {
  const identifierKey = await deriveHkdfBits(
    masterKey,
    new Uint8Array(32),
    'postkeeper-identifier-key-v1',
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importHmacKey(identifierKey),
    encoder.encode('postkeeper-library-id-v1'),
  );
  return toBase64Url(new Uint8Array(signature).slice(0, 18));
}

function recoveryBytes(recoveryKey: string): Uint8Array<ArrayBuffer> {
  if (!recoveryKey.startsWith(RECOVERY_KEY_PREFIX)) throw new Error('Invalid recovery key format.');
  const bytes = fromBase64Url(recoveryKey.slice(RECOVERY_KEY_PREFIX.length), 'Recovery key');
  if (bytes.byteLength !== 32) throw new Error('Invalid recovery key format.');
  return bytes;
}

function recoveryAdditionalData(libraryId: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    JSON.stringify({ version: 1, kind: 'postkeeper-wrapped-master-key', libraryId }),
  );
}

export async function createLibraryKeyMaterial(): Promise<LibraryKeyMaterial> {
  const masterKey = randomBytes(32);
  const recoveryKey = `${RECOVERY_KEY_PREFIX}${toBase64Url(randomBytes(32))}`;
  const libraryId = await deriveLibraryId(masterKey);
  return {
    masterKey,
    recoveryKey,
    libraryId,
    wrappedMasterKey: await wrapMasterKey(masterKey, recoveryKey, libraryId),
  };
}

export async function wrapMasterKey(
  masterKey: Uint8Array,
  recoveryKey: string,
  libraryId: string,
): Promise<WrappedMasterKeyEnvelope> {
  if (masterKey.byteLength !== 32) throw new Error('Master key must contain 32 bytes.');
  if (!libraryId.trim()) throw new Error('Library ID cannot be empty.');
  if ((await deriveLibraryId(masterKey)) !== libraryId) {
    throw new Error('Library ID does not match the master key.');
  }
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const wrappingBits = await deriveHkdfBits(
    recoveryBytes(recoveryKey),
    salt,
    'postkeeper-recovery-wrap-v1',
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: recoveryAdditionalData(libraryId) },
    await importAesKey(wrappingBits),
    ownedBytes(masterKey),
  );
  return {
    version: 1,
    kind: 'postkeeper-wrapped-master-key',
    libraryId,
    keyDerivation: {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBase64Url(salt),
      info: 'postkeeper-recovery-wrap-v1',
    },
    cipher: {
      name: 'AES-GCM',
      nonce: toBase64Url(nonce),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    },
  };
}

export async function recoverMasterKey(
  recoveryKey: string,
  envelope: WrappedMasterKeyEnvelope,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    assertWrappedMasterKeyEnvelope(envelope);
    const wrappingBits = await deriveHkdfBits(
      recoveryBytes(recoveryKey),
      fromBase64Url(envelope.keyDerivation.salt, 'Recovery salt'),
      envelope.keyDerivation.info,
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(envelope.cipher.nonce, 'Recovery nonce'),
        additionalData: recoveryAdditionalData(envelope.libraryId),
      },
      await importAesKey(wrappingBits),
      fromBase64Url(envelope.cipher.ciphertext, 'Wrapped key ciphertext'),
    );
    const masterKey = new Uint8Array(plaintext);
    if (masterKey.byteLength !== 32 || (await deriveLibraryId(masterKey)) !== envelope.libraryId) {
      throw new Error('Recovered key identity mismatch.');
    }
    return masterKey;
  } catch {
    throw new Error('Recovery key is invalid or does not match this library.');
  }
}

export async function verifyRecoveryKey(
  recoveryKey: string,
  envelope: WrappedMasterKeyEnvelope,
): Promise<boolean> {
  try {
    await recoverMasterKey(recoveryKey, envelope);
    return true;
  } catch {
    return false;
  }
}

function objectAdditionalData(libraryId: string, objectPath: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    JSON.stringify({ version: 1, kind: 'postkeeper-encrypted-object', libraryId, objectPath }),
  );
}

async function objectEncryptionKey(masterKey: Uint8Array): Promise<CryptoKey> {
  const bits = await deriveHkdfBits(
    masterKey,
    new Uint8Array(32),
    'postkeeper-object-encryption-key-v1',
  );
  return importAesKey(bits);
}

export async function encryptRemoteObject(
  masterKey: Uint8Array,
  libraryId: string,
  objectPath: string,
  plaintext: Uint8Array,
): Promise<EncryptedObjectEnvelope> {
  if ((await deriveLibraryId(masterKey)) !== libraryId) {
    throw new Error('Library ID does not match the master key.');
  }
  if (!objectPath.trim()) throw new Error('Object path cannot be empty.');
  const nonce = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: objectAdditionalData(libraryId, objectPath),
    },
    await objectEncryptionKey(masterKey),
    ownedBytes(plaintext),
  );
  return {
    version: 1,
    kind: 'postkeeper-encrypted-object',
    libraryId,
    objectPath,
    cipher: {
      name: 'AES-GCM',
      nonce: toBase64Url(nonce),
      ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    },
  };
}

export async function decryptRemoteObject(
  masterKey: Uint8Array,
  expectedLibraryId: string,
  expectedObjectPath: string,
  envelope: EncryptedObjectEnvelope,
): Promise<Uint8Array<ArrayBuffer>> {
  assertEncryptedObjectEnvelope(envelope);
  if (envelope.libraryId !== expectedLibraryId || envelope.objectPath !== expectedObjectPath) {
    throw new Error('Encrypted object metadata does not match its remote location.');
  }
  if ((await deriveLibraryId(masterKey)) !== expectedLibraryId) {
    throw new Error('Master key does not match this library.');
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(envelope.cipher.nonce, 'Object nonce'),
        additionalData: objectAdditionalData(expectedLibraryId, expectedObjectPath),
      },
      await objectEncryptionKey(masterKey),
      fromBase64Url(envelope.cipher.ciphertext, 'Object ciphertext'),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error('Encrypted object failed authentication.');
  }
}

export async function remoteBlobId(masterKey: Uint8Array, plaintextHash: string): Promise<string> {
  const identifierBits = await deriveHkdfBits(
    masterKey,
    new Uint8Array(32),
    'postkeeper-identifier-key-v1',
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importHmacKey(identifierBits),
    encoder.encode(`postkeeper-blob-v1:${plaintextHash}`),
  );
  return toBase64Url(new Uint8Array(signature));
}

export function encodeEnvelope(
  envelope: EncryptedObjectEnvelope | WrappedMasterKeyEnvelope,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(envelope));
}

export function decodeEncryptedObjectEnvelope(bytes: Uint8Array): EncryptedObjectEnvelope {
  const value = JSON.parse(decoder.decode(bytes)) as unknown;
  assertEncryptedObjectEnvelope(value);
  return value;
}

export function decodeWrappedMasterKeyEnvelope(bytes: Uint8Array): WrappedMasterKeyEnvelope {
  const value = JSON.parse(decoder.decode(bytes)) as unknown;
  assertWrappedMasterKeyEnvelope(value);
  return value;
}

export function assertWrappedMasterKeyEnvelope(
  value: unknown,
): asserts value is WrappedMasterKeyEnvelope {
  const envelope = value as Partial<WrappedMasterKeyEnvelope> | null;
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.kind !== 'postkeeper-wrapped-master-key' ||
    typeof envelope.libraryId !== 'string' ||
    envelope.keyDerivation?.name !== 'HKDF' ||
    envelope.keyDerivation.hash !== 'SHA-256' ||
    envelope.keyDerivation.info !== 'postkeeper-recovery-wrap-v1' ||
    typeof envelope.keyDerivation.salt !== 'string' ||
    envelope.cipher?.name !== 'AES-GCM' ||
    typeof envelope.cipher.nonce !== 'string' ||
    typeof envelope.cipher.ciphertext !== 'string'
  ) {
    throw new Error('Unsupported wrapped master-key envelope.');
  }
}

export function assertEncryptedObjectEnvelope(
  value: unknown,
): asserts value is EncryptedObjectEnvelope {
  const envelope = value as Partial<EncryptedObjectEnvelope> | null;
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.kind !== 'postkeeper-encrypted-object' ||
    typeof envelope.libraryId !== 'string' ||
    typeof envelope.objectPath !== 'string' ||
    envelope.cipher?.name !== 'AES-GCM' ||
    typeof envelope.cipher.nonce !== 'string' ||
    typeof envelope.cipher.ciphertext !== 'string'
  ) {
    throw new Error('Unsupported encrypted object envelope.');
  }
}
