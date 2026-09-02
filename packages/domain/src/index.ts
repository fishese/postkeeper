/** Stable domain primitives for the local library. */

export type ArticleId = string & { readonly __brand: 'ArticleId' };
export type SnapshotId = string & { readonly __brand: 'SnapshotId' };
export type BlobId = string & { readonly __brand: 'BlobId' };
export type CategoryId = string & { readonly __brand: 'CategoryId' };

function branded<T extends string>(value: string, label: string): T {
  if (!value.trim()) throw new Error(`${label} cannot be empty.`);
  return value as T;
}

export function articleId(value: string): ArticleId {
  return branded(value, 'Article IDs');
}

export function snapshotId(value: string): SnapshotId {
  return branded(value, 'Snapshot IDs');
}

export function blobId(value: string): BlobId {
  return branded(value, 'Blob IDs');
}

export function categoryId(value: string): CategoryId {
  return branded(value, 'Category IDs');
}

export type CaptureStatus = 'complete' | 'partial' | 'failed';

export type Article = {
  id: ArticleId;
  originalUrl: string;
  canonicalUrl: string;
  title: string;
  author: string;
  siteName: string;
  excerpt: string;
  language: string;
  publishedAt: string | null;
  savedAt: string;
  updatedAt: string;
  isRead: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  currentSnapshotId: SnapshotId;
  captureStatus: CaptureStatus;
  warnings: string[];
  schemaVersion: 1;
};

export type SnapshotAsset = {
  blobId: BlobId;
  originalSrc: string;
  mediaType: string;
};

export type Snapshot = {
  id: SnapshotId;
  articleId: ArticleId;
  capturedAt: string;
  captureMethod: string;
  readerHtmlBlobId: BlobId;
  rawDomBlobId: BlobId | null;
  assetManifest: SnapshotAsset[];
  contentHash: string;
  extractorVersion: string;
  sanitizerVersion: string;
};

export type StoredBlob = {
  id: BlobId;
  mediaType: string;
  byteLength: number;
  location: 'opfs' | 'indexeddb-fallback';
};

export type Category = {
  id: CategoryId;
  name: string;
  sortOrder: number;
  parentId: CategoryId | null;
  viewTemplate: 'list';
  isDeleted: boolean;
};

export type CategoryMembership = {
  articleId: ArticleId;
  categoryId: CategoryId;
  customFields: Record<string, never>;
  createdAt: string;
  updatedAt: string;
};

export type LibraryView =
  'inbox' | 'all' | 'unread' | 'favorites' | 'archive' | { categoryId: CategoryId };

export function articleMatchesView(
  article: Article,
  memberships: readonly CategoryMembership[],
  view: LibraryView,
): boolean {
  if (article.isDeleted) return false;
  const articleMemberships = memberships.filter(
    (membership) => membership.articleId === article.id,
  );
  if (typeof view === 'object') {
    return (
      !article.isArchived &&
      articleMemberships.some((membership) => membership.categoryId === view.categoryId)
    );
  }
  switch (view) {
    case 'inbox':
      return !article.isArchived && articleMemberships.length === 0;
    case 'all':
      return !article.isArchived;
    case 'unread':
      return !article.isArchived && !article.isRead;
    case 'favorites':
      return !article.isArchived && article.isFavorite;
    case 'archive':
      return article.isArchived;
  }
}

export function extractSearchText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenizeSearch(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2);
}
