import { describe, expect, it } from 'vitest';
import {
  createLibraryKeyMaterial,
  decryptRemoteObject,
  encryptRemoteObject,
  recoverMasterKey,
  remoteBlobId,
  verifyRecoveryKey,
} from './crypto';

describe('encrypted sync envelopes', () => {
  it('creates a high-entropy recovery key that restores the same master key', async () => {
    const material = await createLibraryKeyMaterial();
    const restored = await recoverMasterKey(material.recoveryKey, material.wrappedMasterKey);
    expect(restored).toEqual(material.masterKey);
    expect(await verifyRecoveryKey(material.recoveryKey, material.wrappedMasterKey)).toBe(true);
  });

  it('rejects the wrong recovery key before data can be imported', async () => {
    const material = await createLibraryKeyMaterial();
    const wrong = await createLibraryKeyMaterial();
    await expect(recoverMasterKey(wrong.recoveryKey, material.wrappedMasterKey)).rejects.toThrow(
      /invalid or does not match/u,
    );
  });

  it('authenticates library and object-path metadata against substitution', async () => {
    const material = await createLibraryKeyMaterial();
    const plaintext = new TextEncoder().encode('private title and https://secret.example/path');
    const envelope = await encryptRemoteObject(
      material.masterKey,
      material.libraryId,
      'devices/a/operations/0001.json',
      plaintext,
    );
    expect(JSON.stringify(envelope)).not.toContain('private title');
    expect(JSON.stringify(envelope)).not.toContain('secret.example');
    await expect(
      decryptRemoteObject(
        material.masterKey,
        material.libraryId,
        'devices/a/operations/0002.json',
        envelope,
      ),
    ).rejects.toThrow(/metadata/u);
  });

  it('rejects modified ciphertext and hides plaintext blob hashes behind keyed IDs', async () => {
    const material = await createLibraryKeyMaterial();
    const envelope = await encryptRemoteObject(
      material.masterKey,
      material.libraryId,
      'blobs/remote',
      new Uint8Array([1, 2, 3]),
    );
    // Change actual ciphertext bits, not the unused padding bits in the final base64 character.
    const first = envelope.cipher.ciphertext[0];
    envelope.cipher.ciphertext = `${first === 'A' ? 'B' : 'A'}${envelope.cipher.ciphertext.slice(1)}`;
    await expect(
      decryptRemoteObject(material.masterKey, material.libraryId, 'blobs/remote', envelope),
    ).rejects.toThrow(/authentication/u);
    const hash = 'a'.repeat(64);
    expect(await remoteBlobId(material.masterKey, hash)).not.toContain(hash);
  });
});
