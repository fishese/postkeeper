const DB_NAME = 'postkeeper-feasibility';
const STORE = 'records';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function probeIndexedDb(): Promise<string> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({ value: 'transactional record' }, 'probe');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  const value = await new Promise<{ value: string } | undefined>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).get('probe');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (value?.value !== 'transactional record') throw new Error('IndexedDB read-back failed.');
  return 'IndexedDB transactional record read-back passed.';
}

export async function probeBlobStorage(): Promise<string> {
  const bytes = new TextEncoder().encode('PostKeeper OPFS feasibility payload');
  if (navigator.storage?.getDirectory) {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('postkeeper-feasibility.bin', { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    const file = await handle.getFile();
    const result = new Uint8Array(await file.arrayBuffer());
    if (result.join(',') !== bytes.join(',')) throw new Error('OPFS read-back failed.');
    return 'OPFS blob read-back passed.';
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(new Blob([bytes]), 'fallback-blob');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return 'OPFS unavailable; IndexedDB Blob fallback write passed.';
}
