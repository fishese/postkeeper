import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LONG_PRINTABLE_FIXTURE, PUBLIC_FIXTURE } from '@postkeeper/test-fixtures';
import { materializeOperations, mergeOperationLogs } from '@postkeeper/sync-core';
import { openLibrary } from './index';

function dbName(label: string): string {
  return `postkeeper-test-${label}-${Math.random().toString(16).slice(2)}`;
}

describe('local library repository', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase('postkeeper');
  });

  it('imports a trusted fixture and lists it in the inbox', async () => {
    const library = await openLibrary({ name: dbName('import') });
    const article = await library.importTrustedFixture(PUBLIC_FIXTURE);
    const inbox = await library.listArticles('inbox');
    expect(inbox.map((item) => item.title)).toEqual(['A public fixture article']);
    expect(article.captureStatus).toBe('complete');
    const reader = await library.getReader(article.id);
    expect(reader.html).toContain('alpine marmot field notes');
    expect(reader.html).toMatch(/pk-blob:[a-f0-9]{64}/);
    expect(reader.assets).toHaveLength(1);
    expect(reader.assets[0]?.bytes.byteLength).toBeGreaterThan(0);
    await library.close();
  });

  it('keeps category membership and article flags inside repository transactions', async () => {
    const library = await openLibrary({ name: dbName('membership') });
    const first = await library.importTrustedFixture(PUBLIC_FIXTURE);
    const second = await library.importTrustedFixture(LONG_PRINTABLE_FIXTURE);
    const notes = await library.createCategory('Field notes');
    const recipes = await library.createCategory('Recipes');
    await library.renameCategory(recipes.id, 'Cooking');
    await library.setMembership(first.id, notes.id, true);
    await library.setMembership(first.id, recipes.id, true);
    await library.setMembership(second.id, notes.id, true);
    await library.updateArticle(first.id, { isRead: true, isFavorite: true });

    expect((await library.listArticles('inbox')).map((item) => item.title)).toEqual([]);
    expect(
      (await library.listArticles({ categoryId: notes.id })).map((item) => item.title).sort(),
    ).toEqual(['A long printable fixture', 'A public fixture article']);
    expect(
      (await library.listArticles({ categoryId: recipes.id })).map((item) => item.title),
    ).toEqual(['A public fixture article']);

    await library.deleteCategory(recipes.id);
    expect((await library.listCategories()).map((category) => category.name)).toEqual([
      'Field notes',
    ]);
    expect((await library.listArticles({ categoryId: notes.id }))[0]?.categoryNames).toEqual([
      'Field notes',
    ]);

    const cookingGone = (await library.listCategories()).find(
      (category) => category.name === 'Cooking',
    );
    expect(cookingGone).toBeUndefined();
    await library.close();
  });

  it('reorders categories and persists article state after reopening the database', async () => {
    const name = dbName('persist');
    const library = await openLibrary({ name });
    const article = await library.importTrustedFixture(PUBLIC_FIXTURE);
    const alpha = await library.createCategory('Alpha');
    const beta = await library.createCategory('Beta');
    await library.reorderCategories([beta.id, alpha.id]);
    await library.updateArticle(article.id, { isArchived: true, isFavorite: true });
    await library.close();

    const reopened = await openLibrary({ name });
    expect((await reopened.listCategories()).map((category) => category.name)).toEqual([
      'Beta',
      'Alpha',
    ]);
    expect((await reopened.listArticles('archive')).map((item) => item.title)).toEqual([
      'A public fixture article',
    ]);
    expect((await reopened.listArticles('archive'))[0]?.isFavorite).toBe(true);
    await reopened.close();
  });

  it('searches fixture text and can rebuild the index from authoritative records', async () => {
    const library = await openLibrary({ name: dbName('search') });
    await library.importTrustedFixture(PUBLIC_FIXTURE);
    await library.importTrustedFixture(LONG_PRINTABLE_FIXTURE);
    expect((await library.search('alpine marmot')).map((item) => item.title)).toEqual([
      'A public fixture article',
    ]);
    expect((await library.search('river stones')).map((item) => item.title)).toEqual([
      'A long printable fixture',
    ]);
    const rebuilt = await library.rebuildSearchIndex();
    expect(rebuilt).toBe(2);
    expect((await library.search('printable')).map((item) => item.title)).toEqual([
      'A long printable fixture',
    ]);
    await library.close();
  });

  it('records durable operations and restores real metadata and blobs on a clean client', async () => {
    const source = await openLibrary({ name: dbName('sync-source') });
    const article = await source.importTrustedFixture(PUBLIC_FIXTURE);
    const category = await source.createCategory('Synced');
    await source.setMembership(article.id, category.id, true);
    const initialOperations = await source.prepareSyncOperations();
    expect(await source.prepareSyncOperations()).toEqual(initialOperations);
    const initialState = materializeOperations(initialOperations);

    const target = await openLibrary({ name: dbName('sync-target') });
    for (const blob of await source.listSyncBlobs()) {
      await target.importSyncedBlob(blob.id, blob.mediaType, blob.bytes);
    }
    await target.applySyncState(initialState, initialOperations);
    expect((await target.listArticles('all'))[0]).toMatchObject({
      id: article.id,
      title: article.title,
      categoryNames: ['Synced'],
    });
    expect((await target.getReader(article.id)).html).toContain('alpine marmot field notes');

    await source.updateArticle(article.id, { isFavorite: true });
    await target.updateArticle(article.id, { isRead: true });
    const merged = mergeOperationLogs(
      await source.prepareSyncOperations(),
      await target.prepareSyncOperations(),
    );
    const converged = materializeOperations(merged);
    await source.applySyncState(converged, merged);
    await target.applySyncState(converged, merged);
    expect((await source.listArticles('all'))[0]).toMatchObject({ isFavorite: true, isRead: true });
    expect((await target.listArticles('all'))[0]).toMatchObject({ isFavorite: true, isRead: true });

    await source.close();
    await target.close();
  });
});
