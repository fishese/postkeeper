// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevelopmentCaptureFixture, PUBLIC_FIXTURE } from '@postkeeper/test-fixtures';
import { sha256Hex } from '@postkeeper/capture-format';
import { openLibrary, stageBackup, discardBackup, type Library } from './index';
import { backupCanonical, portableMetadata, type BackupEnvelope } from './backup';

const libraries: Library[] = [];
async function disposable() {
  const library = await openLibrary({ name: `backup-disposable-${crypto.randomUUID()}` });
  libraries.push(library);
  return library;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const l of libraries.splice(0)) await l.close();
});
const exportFile = (library: Library) =>
  library.exportBackup({ protection: 'plaintext', applicationVersion: '0.5.0-test' });
async function resign(archive: BackupEnvelope) {
  const { sha256: _hash, ...unsigned } = archive;
  void _hash;
  archive.sha256 = await sha256Hex(new TextEncoder().encode(backupCanonical(unsigned)));
  return JSON.stringify(archive);
}
async function state(library: Library) {
  return {
    metadata: await library.getBackupMetadata(),
    blobs: await library.listSyncBlobs(),
    operations: await library.getSyncOperations(),
    association: await library.getSyncLibraryId(),
    stats: await library.getStats(),
  };
}

describe('portable backup staging and atomic import', () => {
  it('round-trips every snapshot, raw DOM, image, metadata, category, membership, and rebuilt search', async () => {
    const source = await disposable();
    const capture = await createDevelopmentCaptureFixture('public');
    const article = await source.importCapturePackage(capture);
    await source.importCapturePackage({
      ...capture,
      capturedAt: '2026-09-03T00:00:00.000Z',
      extractedReaderHtml: '<h1>Recaptured heading</h1><p>Searchable recapture</p>',
    });
    const first = await source.createCategory('Travel');
    const second = await source.createCategory('Nature');
    await source.setMembership(article.id, first.id, true);
    await source.setMembership(article.id, second.id, true);
    await source.reorderCategories([second.id, first.id]);
    await source.updateArticle(article.id, { isRead: true, isFavorite: true, isArchived: true });
    await source.associateSyncLibrary('original-association');
    await source.prepareSyncOperations();
    const file = await exportFile(source);
    const target = await disposable();
    await target.associateSyncLibrary('target-association');
    const before = await state(target);
    const stage = await stageBackup(file);
    expect(stage).toMatchObject({ articles: 1, snapshots: 2, categories: 2 });
    expect(await state(target)).toEqual(before);
    await target.commitBackup(stage);
    expect(await target.getBackupMetadata()).toEqual(await source.getBackupMetadata());
    expect(await target.listSyncBlobs()).toEqual(
      (await source.listSyncBlobs()).sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect((await target.search('searchable recapture'))[0].id).toBe(article.id);
    expect(await target.getSyncLibraryId()).toBe('target-association');
    expect(await target.getSyncOperations()).toEqual([]);
    expect(JSON.parse(await exportFile(target)).payload).toEqual(JSON.parse(file).payload);
    await target.commitBackup(await stageBackup(file));
    expect((await target.getStats()).snapshots).toBe(2);
  });

  it('excludes credentials, session stores, arbitrary fields, and transient logs by schema projection', async () => {
    const source = await disposable();
    await source.importTrustedFixture(PUBLIC_FIXTURE);
    await source.associateSyncLibrary('DO_NOT_EXPORT_SYNC_ASSOCIATION');
    await source.prepareSyncOperations();
    localStorage.setItem('oauth-token', 'OAUTH_SECRET');
    sessionStorage.setItem('recovery-key', 'RECOVERY_SECRET');
    document.cookie = 'fixture-session=COOKIE_SECRET';
    const metadata = await source.getBackupMetadata();
    Object.assign(metadata.articles[0], {
      accessToken: 'TOKEN_SECRET',
      diagnostics: 'TRANSIENT_LOG_SECRET',
    });
    // Projection strips unknown persisted fields; hostile archive fields are rejected on import.
    expect(JSON.stringify(portableMetadata(metadata))).not.toContain('TOKEN_SECRET');
    expect(JSON.stringify(portableMetadata(metadata))).not.toContain('TRANSIENT_LOG_SECRET');
    const original = source.getBackupMetadata.bind(source);
    vi.spyOn(source, 'getBackupMetadata').mockImplementation(async () => metadata);
    await expect(exportFile(source)).rejects.toThrow();
    vi.mocked(source.getBackupMetadata).mockImplementation(original);
    const file = await exportFile(source);
    for (const secret of [
      'OAUTH_SECRET',
      'RECOVERY_SECRET',
      'COOKIE_SECRET',
      'DO_NOT_EXPORT_SYNC_ASSOCIATION',
      'syncOperations',
      'syncMeta',
      'accessToken',
      'TRANSIENT_LOG_SECRET',
    ])
      expect(file).not.toContain(secret);
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each([
    'truncated',
    'checksum',
    'blob-hash',
    'blob-length',
    'missing-blob',
    'missing-snapshot',
    'ownership',
    'membership',
    'duplicate-id',
    'extra-field',
    'future-version',
    'media',
    'url',
    'base64',
    'orphan-blob',
  ])('rejects %s without touching the disposable active library', async (kind) => {
    const source = await disposable();
    await source.importTrustedFixture(PUBLIC_FIXTURE);
    const archive = JSON.parse(await exportFile(source)) as BackupEnvelope;
    const target = await disposable();
    await target.importTrustedFixture({ ...PUBLIC_FIXTURE, title: 'Keep this existing article' });
    await target.associateSyncLibrary('preserve-association');
    await target.prepareSyncOperations();
    const before = await state(target);
    const payload = archive.payload;
    switch (kind) {
      case 'blob-hash':
        payload.blobs[0].base64 = 'AA==';
        payload.blobs[0].byteLength = 1;
        break;
      case 'blob-length':
        payload.blobs[0].byteLength++;
        break;
      case 'missing-blob':
        payload.blobs.pop();
        break;
      case 'missing-snapshot':
        payload.snapshots = [];
        break;
      case 'ownership':
        payload.snapshots[0].articleId = 'someone-else' as never;
        break;
      case 'membership':
        payload.memberships.push({
          articleId: 'missing' as never,
          categoryId: 'missing' as never,
          customFields: {},
          createdAt: archive.createdAt,
          updatedAt: archive.createdAt,
        });
        break;
      case 'duplicate-id':
        payload.articles.push(payload.articles[0]);
        break;
      case 'extra-field':
        Object.assign(payload.articles[0], { accessToken: 'secret' });
        break;
      case 'future-version':
        archive.formatVersion = 2 as never;
        break;
      case 'media':
        payload.blobs[0].mediaType = 'application/javascript';
        break;
      case 'url':
        payload.articles[0].originalUrl = 'javascript:alert(1)';
        break;
      case 'base64':
        payload.blobs[0].base64 = '!!!!';
        break;
      case 'orphan-blob':
        payload.blobs.push({
          id: 'b'.repeat(64),
          mediaType: 'image/png',
          byteLength: 0,
          base64: '',
        });
        break;
    }
    let text = await resign(archive);
    if (kind === 'truncated') text = text.slice(0, -10);
    if (kind === 'checksum')
      text = text.replace('A public fixture article', 'Tampered fixture article');
    await expect(stageBackup(text).then((s) => target.commitBackup(s))).rejects.toThrow();
    expect(await state(target)).toEqual(before);
  });

  it('rolls back blob writes and metadata on a commit failure, and can retry', async () => {
    const source = await disposable();
    await source.importTrustedFixture(PUBLIC_FIXTURE);
    await source.createCategory('Imported category');
    const target = await disposable();
    const before = await state(target);
    const stage = await stageBackup(await exportFile(source));
    const put = IDBObjectStore.prototype.put;
    const mock = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      if (this.name === 'categories')
        throw new DOMException('Fixture quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    });
    await expect(target.commitBackup(stage)).rejects.toThrow('Fixture quota');
    mock.mockRestore();
    expect(await state(target)).toEqual(before);
    await target.commitBackup(stage);
    expect((await target.getStats()).articles).toBe(1);
  });

  it('adds to a nonempty library without changing existing records or sync operations', async () => {
    const source = await disposable();
    const incoming = await source.importTrustedFixture(PUBLIC_FIXTURE);
    const target = await disposable();
    const original = await target.importTrustedFixture({
      ...PUBLIC_FIXTURE,
      title: 'Keep existing',
    });
    await target.associateSyncLibrary('existing-association');
    const operations = await target.prepareSyncOperations();
    const originalReader = await target.getReader(original.id);
    await target.commitBackup(await stageBackup(await exportFile(source)));
    expect((await target.listArticles('all')).map((v) => v.id).sort()).toEqual(
      [original.id, incoming.id].sort(),
    );
    expect(await target.getReader(original.id)).toEqual(originalReader);
    expect(await target.getSyncOperations()).toEqual(operations);
    expect(await target.getSyncLibraryId()).toBe('existing-association');
  });

  it('rejects collisions including edits made after staging, cancellation, and forged stages', async () => {
    const library = await disposable();
    const article = await library.importTrustedFixture(PUBLIC_FIXTURE);
    const file = await exportFile(library);
    const stage = await stageBackup(file);
    await library.updateArticle(article.id, { isFavorite: true });
    const before = await state(library);
    await expect(library.commitBackup(stage)).rejects.toThrow('conflicts');
    expect(await state(library)).toEqual(before);
    discardBackup(stage);
    await expect(library.commitBackup(stage)).rejects.toThrow();
    await expect(library.commitBackup({ ...stage })).rejects.toThrow();
  });
});
