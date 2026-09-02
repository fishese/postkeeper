import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { probeIndexedDb } from './storageProbe';

describe('IndexedDB feasibility', () => {
  beforeEach(() => indexedDB.deleteDatabase('postkeeper-feasibility'));
  it('writes and reads a transactional record', async () => {
    await expect(probeIndexedDb()).resolves.toContain('passed');
  });
});
