// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openLibrary, stageBackup } from './index';
import { createDevelopmentCaptureFixture } from '@postkeeper/test-fixtures';

describe('pending links', () => {
  it('persists and backs up an explicit pending link, then captures it without losing organization', async () => {
    const name = `pending-${crypto.randomUUID()}`;
    let library = await openLibrary({ name });
    const pending = await library.savePendingLink({
      text: 'Read this https://fixtures.postkeeper.local/public.html',
      title: 'Shared article',
    });
    expect(pending.captureStatus).toBe('partial');
    expect((await library.getReader(pending.id)).snapshot.captureMethod).toBe('pending-link');
    await library.updateArticle(pending.id, { isFavorite: true });
    const category = await library.createCategory('Reading');
    await library.setMembership(pending.id, category.id, true);
    const backup = await library.exportBackup({
      protection: 'plaintext',
      applicationVersion: '0.6.0',
    });
    const clean = await openLibrary({ name: `restore-${crypto.randomUUID()}` });
    await clean.commitBackup(await stageBackup(backup));
    expect((await clean.listArticles('all'))[0]!.warnings).toContain('pending-link');
    await clean.close();
    await library.close();
    library = await openLibrary({ name });
    const captured = await library.importCapturePackage(
      await createDevelopmentCaptureFixture('public'),
      pending.id,
    );
    expect(captured.id).toBe(pending.id);
    expect(captured.isFavorite).toBe(true);
    expect(captured.warnings).not.toContain('pending-link');
    expect((await library.listArticles('all'))[0]!.categoryIds).toContain(category.id);
    expect((await library.getReader(captured.id)).assets).toHaveLength(1);
    expect((await library.savePendingLink({ url: captured.originalUrl })).currentSnapshotId).toBe(
      captured.currentSnapshotId,
    );
    await library.close();
  });
  it('rejects unsafe/oversized shares and deduplicates simultaneous receipt', async () => {
    const library = await openLibrary({ name: `pending-${crypto.randomUUID()}` });
    for (const url of [
      'javascript:alert(1)',
      'file:///tmp/private',
      'https://name:pass@example.com',
      'https://example.com/' + 'x'.repeat(20000),
    ])
      await expect(library.savePendingLink({ url })).rejects.toThrow();
    expect(await library.listArticles('all')).toHaveLength(0);
    const records = await Promise.all([
      library.savePendingLink({ url: 'https://example.com/item' }),
      library.savePendingLink({ url: 'https://example.com/item#fragment' }),
    ]);
    expect(records[0]!.id).toBe(records[1]!.id);
    expect(await library.listArticles('inbox')).toHaveLength(1);
    await library.close();
  });
});
