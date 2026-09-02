import { constantTimeEqual, randomCapability } from './security';

export const MAX_PENDING_TRANSFERS = 5;
export const MAX_PENDING_BYTES = 50 * 1024 * 1024;
export const TRANSFER_TTL_MS = 30 * 60 * 1000;

export type PendingTransfer = {
  id: string;
  secret: string;
  payload: Uint8Array;
  payloadSha256: string;
  createdAt: number;
  expiresAt: number;
  seenRequestNonces: string[];
};

const DB_NAME = 'postkeeper-extension-queue';
const DB_VERSION = 1;
const STORE = 'pending';

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Queue transaction aborted.'));
  });
}

async function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function copyTransfer(value: PendingTransfer): PendingTransfer {
  return {
    ...value,
    payload: value.payload.slice(),
    seenRequestNonces: [...value.seenRequestNonces],
  };
}

export class PendingTransferQueue {
  constructor(private readonly now: () => number = Date.now) {}

  async enqueue(payload: Uint8Array, payloadSha256: string): Promise<PendingTransfer> {
    const database = await openQueue();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const current = (await requestPromise(store.getAll())) as PendingTransfer[];
      const active = current.filter((item) => item.expiresAt > this.now());
      for (const expired of current.filter((item) => item.expiresAt <= this.now()))
        store.delete(expired.id);
      const totalBytes = active.reduce((total, item) => total + item.payload.byteLength, 0);
      if (
        active.length >= MAX_PENDING_TRANSFERS ||
        totalBytes + payload.byteLength > MAX_PENDING_BYTES
      ) {
        transaction.abort();
        throw new Error(
          'The pending capture queue is full. Open PostKeeper to finish queued saves.',
        );
      }
      const transfer: PendingTransfer = {
        id: randomCapability(16),
        secret: randomCapability(),
        payload: payload.slice(),
        payloadSha256,
        createdAt: this.now(),
        expiresAt: this.now() + TRANSFER_TTL_MS,
        seenRequestNonces: [],
      };
      store.put(transfer);
      await transactionDone(transaction);
      return copyTransfer(transfer);
    } finally {
      database.close();
    }
  }

  async authorizeRequest(
    id: string,
    secret: string,
    requestNonce: string,
  ): Promise<PendingTransfer> {
    const database = await openQueue();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const transfer = (await requestPromise(store.get(id))) as PendingTransfer | undefined;
      if (!transfer || transfer.expiresAt <= this.now()) {
        if (transfer) store.delete(id);
        await transactionDone(transaction);
        throw new Error('Pending capture is missing or expired.');
      }
      if (!constantTimeEqual(transfer.secret, secret)) {
        transaction.abort();
        throw new Error('Invalid transfer capability.');
      }
      if (transfer.seenRequestNonces.includes(requestNonce)) {
        transaction.abort();
        throw new Error('Transfer request replay rejected.');
      }
      transfer.seenRequestNonces = [...transfer.seenRequestNonces.slice(-15), requestNonce];
      store.put(transfer);
      await transactionDone(transaction);
      return copyTransfer(transfer);
    } finally {
      database.close();
    }
  }

  async acknowledge(id: string, secret: string, requestNonce: string): Promise<void> {
    const database = await openQueue();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const transfer = (await requestPromise(store.get(id))) as PendingTransfer | undefined;
      if (
        !transfer ||
        !constantTimeEqual(transfer.secret, secret) ||
        !transfer.seenRequestNonces.includes(requestNonce)
      ) {
        transaction.abort();
        throw new Error('Invalid transfer acknowledgement.');
      }
      store.delete(id);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async count(): Promise<number> {
    const database = await openQueue();
    try {
      return await requestPromise(database.transaction(STORE).objectStore(STORE).count());
    } finally {
      database.close();
    }
  }
}
