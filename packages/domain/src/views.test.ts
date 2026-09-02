import { describe, expect, it } from 'vitest';
import {
  articleId,
  articleMatchesView,
  categoryId,
  type Article,
  type CategoryMembership,
} from './index';

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: articleId('article-1'),
    originalUrl: 'https://fixtures.postkeeper.local/public-article',
    canonicalUrl: 'https://fixtures.postkeeper.local/public-article',
    title: 'A public fixture article',
    author: 'Fixture Author',
    siteName: 'PostKeeper Fixtures',
    excerpt: 'Readable public content.',
    language: 'en',
    publishedAt: null,
    savedAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
    isRead: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    currentSnapshotId: 'snap-1' as Article['currentSnapshotId'],
    captureStatus: 'complete',
    warnings: [],
    schemaVersion: 1,
    ...overrides,
  };
}

describe('library views', () => {
  const membership: CategoryMembership = {
    articleId: articleId('article-1'),
    categoryId: categoryId('cat-1'),
    customFields: {},
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
  };

  it('places uncategorized library items in the inbox', () => {
    expect(articleMatchesView(article(), [], 'inbox')).toBe(true);
    expect(articleMatchesView(article(), [membership], 'inbox')).toBe(false);
    expect(articleMatchesView(article({ isArchived: true }), [], 'inbox')).toBe(false);
  });

  it('keeps archived and deleted items out of all/unread/favorites', () => {
    expect(articleMatchesView(article(), [], 'all')).toBe(true);
    expect(articleMatchesView(article({ isArchived: true }), [], 'all')).toBe(false);
    expect(articleMatchesView(article({ isRead: false }), [], 'unread')).toBe(true);
    expect(articleMatchesView(article({ isRead: true }), [], 'unread')).toBe(false);
    expect(articleMatchesView(article({ isFavorite: true }), [], 'favorites')).toBe(true);
    expect(
      articleMatchesView(article({ isFavorite: true, isArchived: true }), [], 'favorites'),
    ).toBe(false);
  });

  it('matches archive and category membership', () => {
    expect(articleMatchesView(article({ isArchived: true }), [], 'archive')).toBe(true);
    expect(articleMatchesView(article(), [membership], { categoryId: categoryId('cat-1') })).toBe(
      true,
    );
    expect(articleMatchesView(article(), [membership], { categoryId: categoryId('cat-2') })).toBe(
      false,
    );
  });
});
