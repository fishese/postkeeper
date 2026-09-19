import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { openLibrary } from '@postkeeper/local-store';
import { PUBLIC_FIXTURE } from '@postkeeper/test-fixtures';
import { createLibraryKeyMaterial, MemorySyncObjectStore } from '@postkeeper/sync-core';
import { previewLibraryMerge, restoreLibraryFromRemote, synchronizeLibrary } from './librarySync';

function dbName(label: string): string {
  return `postkeeper-sync-${label}-${crypto.randomUUID()}`;
}

describe('library sync bridge', () => {
  it.each([false, true])(
    'restores an article tombstone deleted after prior sync=%s',
    async (priorSync) => {
      const source = await openLibrary({ name: dbName('delete-source') });
      const target = await openLibrary({ name: dbName('delete-target') });
      try {
        const remote = new MemorySyncObjectStore();
        const keys = await createLibraryKeyMaterial();
        const article = await source.importTrustedFixture(PUBLIC_FIXTURE);
        if (priorSync) await synchronizeLibrary(source, remote, keys);
        await source.updateArticle(article.id, { isDeleted: true });
        await synchronizeLibrary(source, remote, keys);
        await restoreLibraryFromRemote(target, remote, keys.recoveryKey);
        expect(await target.listArticles('all')).toEqual([]);
        expect(await target.search('marmot')).toEqual([]);
        expect((await target.getReader(article.id)).article.isDeleted).toBe(true);
      } finally {
        source.close();
        target.close();
      }
    },
  );
  it('preserves an edit made during network sync and converges on retry', async () => {
    const source = await openLibrary({ name: dbName('during-sync') });
    const article = await source.importTrustedFixture(PUBLIC_FIXTURE);
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    const originalPut = remote.putImmutable.bind(remote);
    let edited = false;
    vi.spyOn(remote, 'putImmutable').mockImplementation(async (...args) => {
      if (!edited && args[0].includes('/blobs/')) {
        edited = true;
        await source.updateArticle(article.id, { isFavorite: true });
      }
      return originalPut(...args);
    });
    await expect(synchronizeLibrary(source, remote, keys)).rejects.toThrow(
      /Local changes occurred/u,
    );
    expect((await source.listArticles('all'))[0].isFavorite).toBe(true);
    await synchronizeLibrary(source, remote, keys);
    const target = await openLibrary({ name: dbName('after-retry') });
    await restoreLibraryFromRemote(target, remote, keys.recoveryKey);
    expect((await target.listArticles('all'))[0].isFavorite).toBe(true);
    await source.close();
    await target.close();
  });

  it('uploads offline captures when an existing client unlocks with its recovery key', async () => {
    const source = await openLibrary({ name: dbName('unlock-source') });
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    await source.importTrustedFixture(PUBLIC_FIXTURE);
    await synchronizeLibrary(source, remote, keys);
    const latest = await source.importTrustedFixture({
      ...PUBLIC_FIXTURE,
      readerHtml: '<p>A new offline capture.</p>',
    });
    await restoreLibraryFromRemote(source, remote, keys.recoveryKey);
    const target = await openLibrary({ name: dbName('unlock-target') });
    await restoreLibraryFromRemote(target, remote, keys.recoveryKey);
    expect((await target.getReader(latest.id)).html).toContain('A new offline capture.');
    await source.close();
    await target.close();
  });

  it('checks an unchanged library without replaying immutable objects', async () => {
    const library = await openLibrary({ name: dbName('unchanged') });
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    try {
      await library.importTrustedFixture(PUBLIC_FIXTURE);
      await synchronizeLibrary(library, remote, keys);
      const get = vi.spyOn(remote, 'get');
      const list = vi.spyOn(remote, 'list');
      const put = vi.spyOn(remote, 'putImmutable');
      const apply = vi.spyOn(library, 'applySyncState');

      const result = await synchronizeLibrary(library, remote, keys);

      expect(result).toMatchObject({ uploaded: 0, downloaded: 0, restoredBlobs: 0 });
      expect(get).toHaveBeenCalledOnce();
      expect(get.mock.calls[0]?.[0]).toContain('/library-metadata/root.json');
      expect(list).toHaveBeenCalledOnce();
      expect(put).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
    } finally {
      await library.close();
    }
  });

  it('downloads only operations that are not already stored locally', async () => {
    const source = await openLibrary({ name: dbName('incremental-source') });
    const target = await openLibrary({ name: dbName('incremental-target') });
    const remote = new MemorySyncObjectStore();
    const keys = await createLibraryKeyMaterial();
    try {
      const article = await source.importTrustedFixture(PUBLIC_FIXTURE);
      await synchronizeLibrary(source, remote, keys);
      await restoreLibraryFromRemote(target, remote, keys.recoveryKey);
      await source.updateArticle(article.id, { isFavorite: true });
      await synchronizeLibrary(source, remote, keys);
      const targetOperationIds = new Set(
        (await target.getSyncOperations()).map((operation) => operation.operationId),
      );
      const expectedDownloads = (await source.getSyncOperations()).filter(
        (operation) => !targetOperationIds.has(operation.operationId),
      ).length;

      const get = vi.spyOn(remote, 'get');
      const list = vi.spyOn(remote, 'list');
      const put = vi.spyOn(remote, 'putImmutable');
      const result = await synchronizeLibrary(target, remote, keys);

      expect(result.downloaded).toBe(expectedDownloads);
      expect(get).toHaveBeenCalledTimes(expectedDownloads + 1);
      expect(list).toHaveBeenCalledOnce();
      expect(put).not.toHaveBeenCalled();
      expect((await target.listArticles('all'))[0]).toMatchObject({ isFavorite: true });
    } finally {
      await source.close();
      await target.close();
    }
  });

  it('serializes operation preparation across two connections to the same local database', async () => {
    const name = dbName('parallel');
    const first = await openLibrary({ name });
    const second = await openLibrary({ name });
    await first.importTrustedFixture(PUBLIC_FIXTURE);
    const [left, right] = await Promise.all([
      first.prepareSyncOperations(),
      second.prepareSyncOperations(),
    ]);
    expect(left).toEqual(right);
    expect(new Set(left.map((operation) => operation.deviceId)).size).toBe(1);
    await first.close();
    await second.close();
  });

  it('restores metadata and offline reader content onto a clean client', async () => {
    const remote = new MemorySyncObjectStore(1);
    const source = await openLibrary({ name: dbName('source') });
    const article = await source.importTrustedFixture(PUBLIC_FIXTURE);
    await source.updateArticle(article.id, { isFavorite: true });
    const keys = await createLibraryKeyMaterial();
    await synchronizeLibrary(source, remote, keys);

    const target = await openLibrary({ name: dbName('target') });
    const restored = await restoreLibraryFromRemote(target, remote, keys.recoveryKey);
    expect(restored.result.state).toBe('synced');
    expect(restored.result.restoredBlobs).toBeGreaterThan(0);
    expect((await target.listArticles('all'))[0]).toMatchObject({
      title: 'A public fixture article',
      isFavorite: true,
    });
    expect((await target.getReader(article.id)).html).toContain('alpine marmot field notes');
    await source.close();
    await target.close();
  });

  it('uploads no plaintext title, URL, body, or raw encryption key', async () => {
    const remote = new MemorySyncObjectStore();
    const source = await openLibrary({ name: dbName('private') });
    await source.importTrustedFixture(PUBLIC_FIXTURE);
    const keys = await createLibraryKeyMaterial();
    await synchronizeLibrary(source, remote, keys);
    const page = await remote.list('');
    const remoteText = (
      await Promise.all(
        page.objects.map(async (object) =>
          new TextDecoder().decode((await remote.get(object.path)).bytes),
        ),
      )
    ).join('\n');
    expect(remoteText).not.toContain('A public fixture article');
    expect(remoteText).not.toContain('fixture.example.test');
    expect(remoteText).not.toContain('alpine marmot field notes');
    expect(remoteText).not.toContain(Array.from(keys.masterKey).join(','));
    await source.close();
  });

  it('refuses to cross-associate a local library or restore over unrelated local data', async () => {
    const firstRemote = new MemorySyncObjectStore();
    const source = await openLibrary({ name: dbName('association-source') });
    await source.importTrustedFixture(PUBLIC_FIXTURE);
    const firstKeys = await createLibraryKeyMaterial();
    await synchronizeLibrary(source, firstRemote, firstKeys);
    const otherKeys = await createLibraryKeyMaterial();
    await expect(
      synchronizeLibrary(source, new MemorySyncObjectStore(), otherKeys),
    ).rejects.toThrow(/different encrypted sync library/u);

    const unrelated = await openLibrary({ name: dbName('unrelated') });
    await unrelated.importTrustedFixture(PUBLIC_FIXTURE);
    await expect(
      restoreLibraryFromRemote(unrelated, firstRemote, firstKeys.recoveryKey),
    ).rejects.toThrow(/clean local library/u);
    expect(await unrelated.listArticles('all')).toHaveLength(1);
    await source.close();
    await unrelated.close();
  });

  it('previews and then merges nonempty local and remote libraries without replacing either side', async () => {
    const remote = new MemorySyncObjectStore();
    const source = await openLibrary({ name: dbName('merge-source') });
    const local = await openLibrary({ name: dbName('merge-local') });
    const keys = await createLibraryKeyMaterial();
    try {
      await source.importTrustedFixture(PUBLIC_FIXTURE);
      await synchronizeLibrary(source, remote, keys);
      await local.importTrustedFixture({
        ...PUBLIC_FIXTURE,
        originalUrl: 'https://fixtures.postkeeper.local/local-only',
        canonicalUrl: 'https://fixtures.postkeeper.local/local-only',
        title: 'Local-only article',
      });

      const preview = await previewLibraryMerge(local, remote, keys.recoveryKey);
      expect(preview).toMatchObject({
        localArticles: 1,
        remoteArticles: 1,
        remoteDeletedArticles: 0,
      });
      expect(await local.listArticles('all')).toHaveLength(1);

      await restoreLibraryFromRemote(local, remote, keys.recoveryKey, undefined, {
        allowMerge: true,
      });
      expect((await local.listArticles('all')).map((article) => article.title).sort()).toEqual([
        'A public fixture article',
        'Local-only article',
      ]);
    } finally {
      source.close();
      local.close();
    }
  });

  it('allows an explicitly previewed merge to replace a stale library association', async () => {
    const oldRemote = new MemorySyncObjectStore();
    const newRemote = new MemorySyncObjectStore();
    const local = await openLibrary({ name: dbName('reassociate-local') });
    const remoteSource = await openLibrary({ name: dbName('reassociate-remote') });
    const oldKeys = await createLibraryKeyMaterial();
    const newKeys = await createLibraryKeyMaterial();
    try {
      await local.importTrustedFixture(PUBLIC_FIXTURE);
      await synchronizeLibrary(local, oldRemote, oldKeys);
      await remoteSource.importTrustedFixture({
        ...PUBLIC_FIXTURE,
        originalUrl: 'https://fixtures.postkeeper.local/new-remote',
        canonicalUrl: 'https://fixtures.postkeeper.local/new-remote',
        title: 'New remote article',
      });
      await synchronizeLibrary(remoteSource, newRemote, newKeys);

      await expect(restoreLibraryFromRemote(local, newRemote, newKeys.recoveryKey)).rejects.toThrow(
        /different encrypted sync library/u,
      );
      await expect(
        restoreLibraryFromRemote(local, newRemote, newKeys.recoveryKey, undefined, {
          allowMerge: true,
        }),
      ).resolves.toBeDefined();
      expect(await local.getSyncLibraryId()).toBe(newKeys.libraryId);
      expect((await local.listArticles('all')).map((article) => article.title).sort()).toEqual([
        'A public fixture article',
        'New remote article',
      ]);
    } finally {
      await local.close();
      await remoteSource.close();
    }
  });
});
