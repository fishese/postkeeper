import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PendingTransferQueue } from './queue';

async function clearQueue(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('postkeeper-extension-queue');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Queue database deletion was blocked.'));
  });
}

describe('pending extension transfer queue', () => {
  beforeEach(clearQueue);

  it('retains a capture until an authenticated durable-import acknowledgement', async () => {
    const queue = new PendingTransferQueue(() => 1_000);
    const pending = await queue.enqueue(new TextEncoder().encode('capture'), 'a'.repeat(64));
    expect(await queue.count()).toBe(1);
    await expect(queue.acknowledge(pending.id, 'wrong', 'request-1')).rejects.toThrow(/Invalid/);
    expect(await queue.count()).toBe(1);
    const authorized = await queue.authorizeRequest(pending.id, pending.secret, 'request-1');
    expect(new TextDecoder().decode(authorized.payload)).toBe('capture');
    await queue.acknowledge(pending.id, pending.secret, 'request-1');
    expect(await queue.count()).toBe(0);
  });

  it('rejects replayed request nonces while allowing a fresh retry before acknowledgement', async () => {
    const queue = new PendingTransferQueue(() => 2_000);
    const pending = await queue.enqueue(new Uint8Array([1, 2, 3]), 'b'.repeat(64));
    await queue.authorizeRequest(pending.id, pending.secret, 'request-1');
    await expect(queue.authorizeRequest(pending.id, pending.secret, 'request-1')).rejects.toThrow(
      /replay/,
    );
    await expect(
      queue.authorizeRequest(pending.id, pending.secret, 'request-2'),
    ).resolves.toBeDefined();
    expect(await queue.count()).toBe(1);
  });

  it('expires stale captures instead of delivering them', async () => {
    let now = 3_000;
    const queue = new PendingTransferQueue(() => now);
    const pending = await queue.enqueue(new Uint8Array([1]), 'c'.repeat(64));
    now = pending.expiresAt + 1;
    await expect(queue.authorizeRequest(pending.id, pending.secret, 'request-1')).rejects.toThrow(
      /expired/,
    );
    expect(await queue.count()).toBe(0);
  });
});
