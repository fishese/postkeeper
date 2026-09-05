import {
  articleId,
  articleMatchesView,
  parseSharedLink,
  blobId,
  categoryId,
  extractSearchText,
  snapshotId,
  tokenizeSearch,
  type Article,
  type ArticleId,
  type BlobId,
  type Category,
  type CategoryId,
  type CategoryMembership,
  type LibraryView,
  type Snapshot,
  type SnapshotAsset,
  type StoredBlob,
} from '@postkeeper/domain';
import {
  CAPTURE_EXTRACTOR_VERSION,
  CAPTURE_SANITIZER_VERSION,
  processCapturePackage,
} from '@postkeeper/capture-processing';
import {
  backupCanonical,
  createBackup,
  discardBackup,
  encodeBase64,
  portableMetadata,
  stagedBackupData,
  type BackupMetadata,
  type BackupBlob,
  type StagedBackup,
} from './backup';
import {
  appendOperation,
  canonicalJson,
  createDeviceOperationLog,
  mergeOperationLogs,
  type DeviceOperationLog,
  type JsonValue,
  type MaterializedSyncState,
  type NewSyncOperation,
  type SyncOperation,
} from '@postkeeper/sync-core';

export type { Article, Category, CategoryId, CategoryMembership, LibraryView, Snapshot };

export type TrustedAsset = {
  localId: string;
  mediaType: string;
  bytes: Uint8Array;
};

export type TrustedFixture = {
  key: string;
  title: string;
  author: string;
  siteName: string;
  originalUrl: string;
  canonicalUrl: string;
  excerpt: string;
  language: string;
  readerHtml: string;
  assets: TrustedAsset[];
};

export type ArticleListItem = Article & {
  categoryIds: CategoryId[];
  categoryNames: string[];
};

export type ReaderContent = {
  article: Article;
  snapshot: Snapshot;
  html: string;
  assets: Array<{ id: BlobId; mediaType: string; bytes: Uint8Array }>;
};

export type StorageStatus = {
  persisted: boolean;
  usage: number;
  quota: number;
  blobBackend: StoredBlob['location'];
};

export type LibraryStats = {
  articles: number;
  snapshots: number;
  blobs: number;
  categories: number;
};

export type SyncBlob = {
  id: BlobId;
  mediaType: string;
  bytes: Uint8Array;
};

export type RequiredSyncBlob = { id: BlobId; mediaType: string };

export type OpenLibraryOptions = { name?: string };

type SearchDoc = { articleId: ArticleId; bodyText: string; text: string };
type BlobBytesRecord = { id: BlobId; bytes: Uint8Array };
type SyncMetaRecord<T = unknown> = { key: string; value: T };

type EntityProjection = { deleted: boolean; fields: Record<string, JsonValue> };
type SyncProjection = {
  articles: Record<string, EntityProjection>;
  categories: Record<string, EntityProjection>;
  memberships: string[];
  snapshots: Record<string, string>;
};

const EMPTY_SYNC_PROJECTION: SyncProjection = {
  articles: {},
  categories: {},
  memberships: [],
  snapshots: {},
};

const ARTICLE_SYNC_FIELDS = [
  'originalUrl',
  'canonicalUrl',
  'title',
  'author',
  'siteName',
  'excerpt',
  'language',
  'publishedAt',
  'savedAt',
  'updatedAt',
  'isRead',
  'isFavorite',
  'isArchived',
  'currentSnapshotId',
  'captureStatus',
  'warnings',
  'schemaVersion',
] as const satisfies ReadonlyArray<Exclude<keyof Article, 'id' | 'isDeleted'>>;

const CATEGORY_SYNC_FIELDS = [
  'name',
  'sortOrder',
  'parentId',
  'viewTemplate',
] as const satisfies ReadonlyArray<Exclude<keyof Category, 'id' | 'isDeleted'>>;

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function buildSyncProjection(
  articles: readonly Article[],
  categories: readonly Category[],
  memberships: readonly CategoryMembership[],
  snapshots: readonly Snapshot[],
): SyncProjection {
  return {
    articles: Object.fromEntries(
      articles.map((article) => [
        article.id,
        {
          deleted: article.isDeleted,
          fields: Object.fromEntries(
            ARTICLE_SYNC_FIELDS.map((field) => [field, jsonValue(article[field])]),
          ),
        },
      ]),
    ),
    categories: Object.fromEntries(
      categories.map((category) => [
        category.id,
        {
          deleted: category.isDeleted,
          fields: Object.fromEntries(
            CATEGORY_SYNC_FIELDS.map((field) => [field, jsonValue(category[field])]),
          ),
        },
      ]),
    ),
    memberships: memberships
      .map((membership) => `${membership.articleId}:${membership.categoryId}`)
      .sort(),
    snapshots: Object.fromEntries(
      snapshots.map((snapshot) => [snapshot.id, canonicalJson(jsonValue(snapshot))]),
    ),
  };
}

function requireString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string') throw new Error(`Synced ${label} must be a string.`);
  return value;
}

function requireBoolean(value: JsonValue | undefined, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Synced ${label} must be a boolean.`);
  return value;
}

function requireNumber(value: JsonValue | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Synced ${label} must be a finite number.`);
  }
  return value;
}

function requireBlobId(value: JsonValue | undefined, label: string): BlobId {
  const id = requireString(value, label);
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error(`Synced ${label} is not a SHA-256 blob ID.`);
  return blobId(id);
}

function articleFromSync(id: string, entity: MaterializedSyncState['articles'][string]): Article {
  const values = entity.values;
  const warnings = values.warnings;
  if (!Array.isArray(warnings) || !warnings.every((warning) => typeof warning === 'string')) {
    throw new Error('Synced article warnings are invalid.');
  }
  const publishedAt = values.publishedAt;
  if (publishedAt !== null && typeof publishedAt !== 'string') {
    throw new Error('Synced article publication date is invalid.');
  }
  const captureStatus = values.captureStatus;
  if (!['complete', 'partial', 'failed'].includes(String(captureStatus))) {
    throw new Error('Synced article capture status is invalid.');
  }
  if (values.schemaVersion !== 1) throw new Error('Unsupported synced article version.');
  return {
    id: articleId(id),
    originalUrl: requireString(values.originalUrl, 'original URL'),
    canonicalUrl: requireString(values.canonicalUrl, 'canonical URL'),
    title: requireString(values.title, 'title'),
    author: requireString(values.author, 'author'),
    siteName: requireString(values.siteName, 'site name'),
    excerpt: requireString(values.excerpt, 'excerpt'),
    language: requireString(values.language, 'language'),
    publishedAt,
    savedAt: requireString(values.savedAt, 'saved date'),
    updatedAt: requireString(values.updatedAt, 'updated date'),
    isRead: requireBoolean(values.isRead, 'read state'),
    isFavorite: requireBoolean(values.isFavorite, 'favorite state'),
    isArchived: requireBoolean(values.isArchived, 'archive state'),
    isDeleted: entity.deleted,
    currentSnapshotId: snapshotId(requireString(values.currentSnapshotId, 'snapshot ID')),
    captureStatus: captureStatus as Article['captureStatus'],
    warnings,
    schemaVersion: 1,
  };
}

function categoryFromSync(
  id: string,
  entity: MaterializedSyncState['categories'][string],
): Category {
  const parent = entity.values.parentId;
  if (parent !== null && typeof parent !== 'string') {
    throw new Error('Synced category parent is invalid.');
  }
  if (entity.values.viewTemplate !== 'list') {
    throw new Error('Unsupported synced category view.');
  }
  return {
    id: categoryId(id),
    name: requireString(entity.values.name, 'category name'),
    sortOrder: requireNumber(entity.values.sortOrder, 'category sort order'),
    parentId: parent === null ? null : categoryId(parent),
    viewTemplate: 'list',
    isDeleted: entity.deleted,
  };
}

function snapshotFromSync(id: string, value: MaterializedSyncState['snapshots'][string]): Snapshot {
  if (!value.snapshot || typeof value.snapshot !== 'object' || Array.isArray(value.snapshot)) {
    throw new Error('Synced snapshot is invalid.');
  }
  const item = value.snapshot as Record<string, JsonValue>;
  if (item.id !== id || item.articleId !== value.articleId) {
    throw new Error('Synced snapshot identity does not match its operation.');
  }
  const manifest = item.assetManifest;
  if (!Array.isArray(manifest)) throw new Error('Synced snapshot asset manifest is invalid.');
  return {
    id: snapshotId(id),
    articleId: articleId(requireString(item.articleId, 'snapshot article ID')),
    capturedAt: requireString(item.capturedAt, 'snapshot capture date'),
    captureMethod: requireString(item.captureMethod, 'snapshot capture method'),
    readerHtmlBlobId: requireBlobId(item.readerHtmlBlobId, 'reader blob ID'),
    rawDomBlobId:
      item.rawDomBlobId === null ? null : requireBlobId(item.rawDomBlobId, 'raw DOM blob ID'),
    assetManifest: manifest.map((asset) => {
      if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
        throw new Error('Synced snapshot asset is invalid.');
      }
      return {
        blobId: requireBlobId(asset.blobId, 'asset blob ID'),
        originalSrc: requireString(asset.originalSrc, 'asset source'),
        mediaType: requireString(asset.mediaType, 'asset media type'),
      };
    }),
    contentHash: requireString(item.contentHash, 'snapshot content hash'),
    extractorVersion: requireString(item.extractorVersion, 'extractor version'),
    sanitizerVersion: requireString(item.sanitizerVersion, 'sanitizer version'),
  };
}

export function requiredSyncBlobs(state: MaterializedSyncState): RequiredSyncBlob[] {
  const blobs = new Map<BlobId, string>();
  for (const [id, value] of Object.entries(state.snapshots)) {
    const snapshot = snapshotFromSync(id, value);
    blobs.set(snapshot.readerHtmlBlobId, 'text/html;charset=utf-8');
    if (snapshot.rawDomBlobId) blobs.set(snapshot.rawDomBlobId, 'text/html;charset=utf-8');
    for (const asset of snapshot.assetManifest) blobs.set(asset.blobId, asset.mediaType);
  }
  return [...blobs].map(([id, mediaType]) => ({ id, mediaType }));
}

const DB_VERSION = 2;
const DEFAULT_DB_NAME = 'postkeeper';

function createSortableId(): string {
  const time = Date.now().toString(16).padStart(12, '0');
  const random = Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${time}${random}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hash = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function asBytes(value: unknown): Uint8Array {
  if (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === '[object Uint8Array]'
  ) {
    const view = value as Uint8Array;
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy;
  }
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return new Uint8Array(value as ArrayBuffer);
  }
  throw new Error('Unsupported blob payload.');
}

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
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted.'));
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of ['articles', 'snapshots', 'blobMeta', 'blobBytes', 'categories']) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: 'id' });
        }
      }
      if (!database.objectStoreNames.contains('searchDocs')) {
        database.createObjectStore('searchDocs', { keyPath: 'articleId' });
      }
      if (!database.objectStoreNames.contains('memberships')) {
        const memberships = database.createObjectStore('memberships', {
          keyPath: ['articleId', 'categoryId'],
        });
        memberships.createIndex('articleId', 'articleId');
        memberships.createIndex('categoryId', 'categoryId');
      }
      if (!database.objectStoreNames.contains('syncOperations')) {
        database.createObjectStore('syncOperations', { keyPath: 'operationId' });
      }
      if (!database.objectStoreNames.contains('syncMeta')) {
        database.createObjectStore('syncMeta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function composeSearchText(
  article: Article,
  bodyText: string,
  categoryNames: readonly string[],
): string {
  return [
    article.title,
    article.author,
    article.siteName,
    article.excerpt,
    article.originalUrl,
    article.canonicalUrl,
    ...categoryNames,
    bodyText,
  ]
    .join(' ')
    .toLowerCase();
}

export function rewriteReaderHtml(html: string, urls: ReadonlyMap<string, string>): string {
  return html.replace(/pk-blob:([a-f0-9]{64})/gi, (match, hash: string) => urls.get(hash) ?? match);
}

export class Library {
  private blobBackend: StoredBlob['location'];

  private constructor(private readonly database: IDBDatabase) {
    this.blobBackend =
      typeof navigator !== 'undefined' && navigator.storage && 'getDirectory' in navigator.storage
        ? 'opfs'
        : 'indexeddb-fallback';
  }

  static async open(options: OpenLibraryOptions = {}): Promise<Library> {
    return new Library(await openDatabase(options.name ?? DEFAULT_DB_NAME));
  }

  async close(): Promise<void> {
    this.database.close();
  }

  async getBackupMetadata(): Promise<BackupMetadata> {
    const stores = ['articles', 'categories', 'memberships', 'snapshots'] as const;
    const transaction = this.database.transaction([...stores]);
    const done = transactionDone(transaction);
    const records = await Promise.all(
      stores.map((store) => requestPromise(transaction.objectStore(store).getAll())),
    );
    await done;
    return portableMetadata(
      Object.fromEntries(stores.map((store, i) => [store, records[i]])) as BackupMetadata,
    );
  }

  async exportBackup(options: {
    protection: 'plaintext';
    applicationVersion: string;
  }): Promise<string> {
    if (options.protection !== 'plaintext') throw new Error('Choose plaintext backup explicitly.');
    // Metadata is read under one transaction. Referenced blobs are immutable and never removed.
    const metadata = await this.getBackupMetadata();
    const ids = new Set(
      metadata.snapshots.flatMap((snapshot) => [
        snapshot.readerHtmlBlobId,
        ...(snapshot.rawDomBlobId ? [snapshot.rawDomBlobId] : []),
        ...snapshot.assetManifest.map((a) => a.blobId),
      ]),
    );
    const blobs: BackupBlob[] = [];
    for (const id of [...ids].sort()) {
      const meta = await this.get<StoredBlob>('blobMeta', id);
      if (!meta) throw new Error('A required local blob is missing. Backup was not exported.');
      const bytes = await this.getBlobBytes(id);
      blobs.push({
        id,
        mediaType: meta.mediaType,
        byteLength: bytes.byteLength,
        base64: encodeBase64(bytes),
      });
    }
    return createBackup({ ...metadata, blobs }, options.applicationVersion);
  }

  async commitBackup(stage: StagedBackup): Promise<void> {
    const { payload, bytes } = stagedBackupData(stage);
    const stores = [
      'articles',
      'categories',
      'memberships',
      'snapshots',
      'blobMeta',
      'blobBytes',
      'searchDocs',
    ];
    const transaction = this.database.transaction(stores, 'readwrite');
    const done = transactionDone(transaction);
    try {
      // Collision checks and writes share a lock, protecting edits from other tabs and sync.
      for (const store of ['articles', 'categories', 'memberships', 'snapshots'] as const) {
        const objectStore = transaction.objectStore(store);
        for (const record of payload[store]) {
          const key = 'id' in record ? record.id : [record.articleId, record.categoryId];
          const existing: unknown = await requestPromise(objectStore.get(key));
          if (existing && backupCanonical(existing) !== backupCanonical(record)) {
            throw new Error(
              'Backup conflicts with existing records. Nothing was imported. Use an empty library to restore this backup.',
            );
          }
        }
      }
      for (const blob of payload.blobs) {
        const existing = (await requestPromise(
          transaction.objectStore('blobMeta').get(blob.id),
        )) as StoredBlob | undefined;
        if (
          existing &&
          (existing.mediaType !== blob.mediaType || existing.byteLength !== blob.byteLength)
        ) {
          throw new Error('Backup conflicts with existing content. Nothing was imported.');
        }
        // Imported bytes use the transactional fallback even on OPFS-capable clients. A failed
        // transaction cannot leave orphan files or overwrite any active OPFS content.
        transaction.objectStore('blobMeta').put({
          id: blobId(blob.id),
          mediaType: blob.mediaType,
          byteLength: blob.byteLength,
          location: 'indexeddb-fallback',
        } satisfies StoredBlob);
        transaction.objectStore('blobBytes').put({ id: blob.id, bytes: bytes.get(blob.id)! });
      }
      for (const store of ['articles', 'categories', 'memberships', 'snapshots'] as const) {
        for (const record of payload[store]) transaction.objectStore(store).put(record);
      }
      const allCategories = (await requestPromise(
        transaction.objectStore('categories').getAll(),
      )) as Category[];
      const allMemberships = (await requestPromise(
        transaction.objectStore('memberships').getAll(),
      )) as CategoryMembership[];
      const names = new Map(allCategories.filter((v) => !v.isDeleted).map((v) => [v.id, v.name]));
      const snapshots = new Map(payload.snapshots.map((v) => [v.id, v]));
      for (const article of payload.articles) {
        const snapshot = snapshots.get(article.currentSnapshotId)!;
        const bodyText = extractSearchText(
          new TextDecoder().decode(bytes.get(snapshot.readerHtmlBlobId)!),
        );
        const categoryNames = allMemberships
          .filter((v) => v.articleId === article.id)
          .map((v) => names.get(v.categoryId))
          .filter((v): v is string => Boolean(v));
        transaction.objectStore('searchDocs').put({
          articleId: article.id,
          bodyText,
          text: composeSearchText(article, bodyText, categoryNames),
        } satisfies SearchDoc);
      }
      await done;
      discardBackup(stage);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* Already aborted by IndexedDB (for example quota). */
      }
      await done.catch(() => undefined);
      throw error;
    }
  }

  async importTrustedFixture(fixture: TrustedFixture): Promise<Article> {
    const now = new Date().toISOString();
    const assets: SnapshotAsset[] = [];
    let html = fixture.readerHtml;
    for (const asset of fixture.assets) {
      const stored = await this.putBlob(asset.bytes, asset.mediaType);
      html = html.replaceAll(`pk-blob:${asset.localId}`, `pk-blob:${stored.id}`);
      assets.push({ blobId: stored.id, originalSrc: asset.localId, mediaType: asset.mediaType });
    }
    const htmlBlob = await this.putBlob(new TextEncoder().encode(html), 'text/html;charset=utf-8');
    const article: Article = {
      id: articleId(createSortableId()),
      originalUrl: fixture.originalUrl,
      canonicalUrl: fixture.canonicalUrl,
      title: fixture.title,
      author: fixture.author,
      siteName: fixture.siteName,
      excerpt: fixture.excerpt,
      language: fixture.language,
      publishedAt: null,
      savedAt: now,
      updatedAt: now,
      isRead: false,
      isFavorite: false,
      isArchived: false,
      isDeleted: false,
      currentSnapshotId: snapshotId(createSortableId()),
      captureStatus: 'complete',
      warnings: [],
      schemaVersion: 1,
    };
    const snapshot: Snapshot = {
      id: article.currentSnapshotId,
      articleId: article.id,
      capturedAt: now,
      captureMethod: 'trusted-fixture',
      readerHtmlBlobId: htmlBlob.id,
      rawDomBlobId: null,
      assetManifest: assets,
      contentHash: htmlBlob.id,
      extractorVersion: 'trusted-fixture',
      sanitizerVersion: 'trusted-fixture',
    };
    const bodyText = extractSearchText(html);
    const transaction = this.database.transaction(
      ['articles', 'snapshots', 'searchDocs'],
      'readwrite',
    );
    transaction.objectStore('articles').put(article);
    transaction.objectStore('snapshots').put(snapshot);
    transaction.objectStore('searchDocs').put({
      articleId: article.id,
      bodyText,
      text: composeSearchText(article, bodyText, []),
    } satisfies SearchDoc);
    await transactionDone(transaction);
    return article;
  }

  async savePendingLink(input: { url?: string; text?: string; title?: string }): Promise<Article> {
    const shared = parseSharedLink(input);
    const existing = (await this.getAll<Article>('articles')).find(
      (item) =>
        !item.isDeleted && (item.canonicalUrl === shared.url || item.originalUrl === shared.url),
    );
    if (existing) return existing;
    return this.importCapturePackage({
      formatVersion: 1,
      captureId: createSortableId(),
      capturedAt: new Date().toISOString(),
      captureMethod: 'pending-link',
      sourceBrowser: 'PostKeeper share target',
      originalUrl: shared.url,
      canonicalUrl: shared.url,
      metadata: { title: shared.title, siteName: new URL(shared.url).hostname },
      renderedDom:
        '<article><p>Only the link is saved. Capture this page to read its content offline.</p></article>',
      extractedReaderHtml:
        '<article><p>Only the link is saved. Capture this page to read its content offline.</p></article>',
      assets: [],
      warnings: ['pending-link'],
    });
  }

  async importCapturePackage(value: unknown, pendingId?: ArticleId): Promise<Article> {
    const processed = await processCapturePackage(value);
    const capture = processed.capture;
    const storedAssets: SnapshotAsset[] = [];
    let html = processed.readerHtml;
    for (const asset of capture.assets) {
      const stored = await this.putBlob(asset.bytes, asset.mediaType);
      html = html.replaceAll(`pk-asset:${asset.assetId}`, `pk-blob:${stored.id}`);
      storedAssets.push({
        blobId: stored.id,
        originalSrc: asset.sourceUrl,
        mediaType: asset.mediaType,
      });
    }
    const rawDomBlob = await this.putBlob(
      new TextEncoder().encode(capture.renderedDom),
      'text/html;charset=utf-8',
    );
    const readerHtmlBlob = await this.putBlob(
      new TextEncoder().encode(html),
      'text/html;charset=utf-8',
    );
    // Resolve identity and read mutable organization under the same write lock as
    // the new snapshot. Another tab may be capturing or editing this article too.
    const transaction = this.database.transaction(
      ['articles', 'snapshots', 'searchDocs', 'memberships', 'categories'],
      'readwrite',
    );
    const [allArticles, allMemberships, allCategories] = await Promise.all([
      requestPromise(transaction.objectStore('articles').getAll()) as Promise<Article[]>,
      requestPromise(transaction.objectStore('memberships').getAll()) as Promise<
        CategoryMembership[]
      >,
      requestPromise(transaction.objectStore('categories').getAll()) as Promise<Category[]>,
    ]);
    if (capture.captureMethod === 'pending-link') {
      const duplicate = allArticles.find(
        (a) =>
          !a.isDeleted &&
          (a.canonicalUrl === capture.canonicalUrl || a.originalUrl === capture.originalUrl),
      );
      if (duplicate) {
        await transactionDone(transaction);
        return duplicate;
      }
    }
    const pending = pendingId
      ? allArticles.find(
          (a) => a.id === pendingId && !a.isDeleted && a.warnings.includes('pending-link'),
        )
      : undefined;
    const existing =
      allArticles.find(
        (article) => !article.isDeleted && article.canonicalUrl === capture.canonicalUrl,
      ) ?? pending;
    const now = new Date().toISOString();
    const nextSnapshotId = snapshotId(createSortableId());
    const metadata = processed.metadata;
    const article: Article = existing
      ? {
          ...existing,
          originalUrl: capture.originalUrl,
          canonicalUrl: capture.canonicalUrl,
          title: metadata.title,
          author: metadata.author ?? '',
          siteName: metadata.siteName ?? '',
          excerpt: metadata.excerpt ?? '',
          language: metadata.language ?? '',
          publishedAt: metadata.publishedAt ?? null,
          updatedAt: now,
          currentSnapshotId: nextSnapshotId,
          captureStatus: processed.status,
          warnings: processed.warnings,
        }
      : {
          id: articleId(createSortableId()),
          originalUrl: capture.originalUrl,
          canonicalUrl: capture.canonicalUrl,
          title: metadata.title,
          author: metadata.author ?? '',
          siteName: metadata.siteName ?? '',
          excerpt: metadata.excerpt ?? '',
          language: metadata.language ?? '',
          publishedAt: metadata.publishedAt ?? null,
          savedAt: now,
          updatedAt: now,
          isRead: false,
          isFavorite: false,
          isArchived: false,
          isDeleted: false,
          currentSnapshotId: nextSnapshotId,
          captureStatus: processed.status,
          warnings: processed.warnings,
          schemaVersion: 1,
        };
    const snapshot: Snapshot = {
      id: nextSnapshotId,
      articleId: article.id,
      capturedAt: capture.capturedAt,
      captureMethod: capture.captureMethod,
      readerHtmlBlobId: readerHtmlBlob.id,
      rawDomBlobId: rawDomBlob.id,
      assetManifest: storedAssets,
      contentHash: readerHtmlBlob.id,
      extractorVersion: CAPTURE_EXTRACTOR_VERSION,
      sanitizerVersion: CAPTURE_SANITIZER_VERSION,
    };
    const memberships = allMemberships.filter((membership) => membership.articleId === article.id);
    const categoryNames = new Map(
      allCategories
        .filter((category) => !category.isDeleted)
        .map((category) => [category.id, category.name]),
    );
    const bodyText = extractSearchText(html);
    transaction.objectStore('articles').put(article);
    transaction.objectStore('snapshots').put(snapshot);
    transaction.objectStore('searchDocs').put({
      articleId: article.id,
      bodyText,
      text: composeSearchText(
        article,
        bodyText,
        memberships
          .map((membership) => categoryNames.get(membership.categoryId))
          .filter((name): name is string => Boolean(name)),
      ),
    } satisfies SearchDoc);
    await transactionDone(transaction);
    return article;
  }

  async listArticles(view: LibraryView): Promise<ArticleListItem[]> {
    const [articles, memberships, categories] = await Promise.all([
      this.getAll<Article>('articles'),
      this.getAll<CategoryMembership>('memberships'),
      this.listCategories(),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    return articles
      .filter((article) => articleMatchesView(article, memberships, view))
      .map((article) => this.withCategories(article, memberships, names))
      .sort(
        (left, right) =>
          right.savedAt.localeCompare(left.savedAt) || right.id.localeCompare(left.id),
      );
  }

  async listCategories(): Promise<Category[]> {
    return (await this.getAll<Category>('categories'))
      .filter((category) => !category.isDeleted)
      .sort(
        (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
      );
  }

  async createCategory(name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category names cannot be empty.');
    const existing = await this.listCategories();
    const category: Category = {
      id: categoryId(createSortableId()),
      name: trimmed,
      sortOrder: existing.length,
      parentId: null,
      viewTemplate: 'list',
      isDeleted: false,
    };
    await this.put('categories', category);
    return category;
  }

  async renameCategory(id: CategoryId, name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category names cannot be empty.');
    const category = await this.requireCategory(id);
    category.name = trimmed;
    await this.put('categories', category);
    await this.refreshSearchForCategory(id);
    return category;
  }

  async reorderCategories(orderedIds: readonly CategoryId[]): Promise<Category[]> {
    const categories = await this.listCategories();
    const rank = new Map(orderedIds.map((id, index) => [id, index]));
    for (const category of categories) {
      category.sortOrder = rank.get(category.id) ?? orderedIds.length + category.sortOrder;
      await this.put('categories', category);
    }
    return this.listCategories();
  }

  async deleteCategory(id: CategoryId): Promise<void> {
    const category = await this.requireCategory(id);
    category.isDeleted = true;
    const memberships = (await this.getAll<CategoryMembership>('memberships')).filter(
      (membership) => membership.categoryId === id,
    );
    const affected = [...new Set(memberships.map((membership) => membership.articleId))];
    const transaction = this.database.transaction(['categories', 'memberships'], 'readwrite');
    transaction.objectStore('categories').put(category);
    for (const membership of memberships) {
      transaction.objectStore('memberships').delete([membership.articleId, membership.categoryId]);
    }
    await transactionDone(transaction);
    for (const article of affected) await this.refreshSearchDoc(article);
  }

  async setMembership(article: ArticleId, category: CategoryId, member: boolean): Promise<void> {
    await this.requireArticle(article);
    await this.requireCategory(category);
    const now = new Date().toISOString();
    const transaction = this.database.transaction(['memberships'], 'readwrite');
    if (member) {
      transaction.objectStore('memberships').put({
        articleId: article,
        categoryId: category,
        customFields: {},
        createdAt: now,
        updatedAt: now,
      } satisfies CategoryMembership);
    } else {
      transaction.objectStore('memberships').delete([article, category]);
    }
    await transactionDone(transaction);
    await this.refreshSearchDoc(article);
  }

  async updateArticle(
    id: ArticleId,
    patch: Partial<Pick<Article, 'isRead' | 'isFavorite' | 'isArchived'>>,
  ): Promise<Article> {
    const transaction = this.database.transaction('articles', 'readwrite');
    const store = transaction.objectStore('articles');
    const article = (await requestPromise(store.get(id))) as Article | undefined;
    if (!article) {
      await transactionDone(transaction);
      throw new Error(`Article not found: ${id}`);
    }
    const updated: Article = { ...article, ...patch, updatedAt: new Date().toISOString() };
    store.put(updated);
    await transactionDone(transaction);
    await this.refreshSearchDoc(id);
    return updated;
  }

  async search(query: string): Promise<ArticleListItem[]> {
    const tokens = tokenizeSearch(query);
    if (tokens.length === 0) return this.listArticles('all');
    const docs = await this.getAll<SearchDoc>('searchDocs');
    const matches = new Set(
      docs
        .filter((doc) => tokens.every((token) => doc.text.includes(token)))
        .map((doc) => doc.articleId),
    );
    const seen = new Set<string>();
    const results: ArticleListItem[] = [];
    for (const view of ['all', 'archive'] as const) {
      for (const article of await this.listArticles(view)) {
        if (matches.has(article.id) && !seen.has(article.id)) {
          seen.add(article.id);
          results.push(article);
        }
      }
    }
    return results;
  }

  async rebuildSearchIndex(): Promise<number> {
    const articles = (await this.getAll<Article>('articles')).filter(
      (article) => !article.isDeleted,
    );
    const memberships = await this.getAll<CategoryMembership>('memberships');
    const names = new Map(
      (await this.listCategories()).map((category) => [category.id, category.name]),
    );
    const transaction = this.database.transaction(['searchDocs'], 'readwrite');
    transaction.objectStore('searchDocs').clear();
    await transactionDone(transaction);
    for (const article of articles) {
      const snapshot = await this.requireSnapshot(article.currentSnapshotId);
      const html = new TextDecoder().decode(await this.getBlobBytes(snapshot.readerHtmlBlobId));
      const bodyText = extractSearchText(html);
      const categoryNames = memberships
        .filter((membership) => membership.articleId === article.id)
        .map((membership) => names.get(membership.categoryId))
        .filter((value): value is string => Boolean(value));
      await this.put('searchDocs', {
        articleId: article.id,
        bodyText,
        text: composeSearchText(article, bodyText, categoryNames),
      } satisfies SearchDoc);
    }
    return articles.length;
  }

  async getReader(id: ArticleId): Promise<ReaderContent> {
    const article = await this.requireArticle(id);
    const snapshot = await this.requireSnapshot(article.currentSnapshotId);
    const html = new TextDecoder().decode(await this.getBlobBytes(snapshot.readerHtmlBlobId));
    const assets = await Promise.all(
      snapshot.assetManifest.map(async (asset) => ({
        id: asset.blobId,
        mediaType: asset.mediaType,
        bytes: await this.getBlobBytes(asset.blobId),
      })),
    );
    return { article, snapshot, html, assets };
  }

  async listSnapshots(id: ArticleId): Promise<Snapshot[]> {
    return (await this.getAll<Snapshot>('snapshots'))
      .filter((snapshot) => snapshot.articleId === id)
      .sort(
        (left, right) =>
          left.capturedAt.localeCompare(right.capturedAt) || left.id.localeCompare(right.id),
      );
  }

  async getStats(): Promise<LibraryStats> {
    const [articles, snapshots, blobs, categories] = await Promise.all([
      this.getAll<Article>('articles'),
      this.getAll<Snapshot>('snapshots'),
      this.getAll<StoredBlob>('blobMeta'),
      this.getAll<Category>('categories'),
    ]);
    return {
      articles: articles.filter((article) => !article.isDeleted).length,
      snapshots: snapshots.length,
      blobs: blobs.length,
      categories: categories.filter((category) => !category.isDeleted).length,
    };
  }

  async prepareSyncOperations(): Promise<SyncOperation[]> {
    const transaction = this.database.transaction(
      ['articles', 'categories', 'memberships', 'snapshots', 'syncOperations', 'syncMeta'],
      'readwrite',
    );
    const readAll = <T>(store: string) =>
      requestPromise(transaction.objectStore(store).getAll()) as Promise<T[]>;
    const [articles, categories, memberships, snapshots, storedOperations, syncMeta] =
      await Promise.all([
        readAll<Article>('articles'),
        readAll<Category>('categories'),
        readAll<CategoryMembership>('memberships'),
        readAll<Snapshot>('snapshots'),
        readAll<SyncOperation>('syncOperations'),
        readAll<SyncMetaRecord>('syncMeta'),
      ]);
    const deviceId =
      (syncMeta.find((record) => record.key === 'device-id')?.value as string | undefined) ??
      crypto.randomUUID();
    const previous =
      (syncMeta.find((record) => record.key === 'projection')?.value as
        SyncProjection | undefined) ?? EMPTY_SYNC_PROJECTION;
    const current = buildSyncProjection(articles, categories, memberships, snapshots);
    const ownOperations = storedOperations
      .filter((operation) => operation.deviceId === deviceId)
      .sort((left, right) => left.sequence - right.sequence);
    const log: DeviceOperationLog = createDeviceOperationLog(deviceId);
    log.operations = [...ownOperations];
    log.nextSequence = (ownOperations.at(-1)?.sequence ?? 0) + 1;
    const newOperations: SyncOperation[] = [];
    const timestamp = [new Date().toISOString(), ownOperations.at(-1)?.occurredAt ?? '']
      .sort()
      .at(-1)!;
    const emit = (operation: NewSyncOperation) => {
      newOperations.push(appendOperation(log, operation, timestamp));
    };

    for (const [id, entity] of Object.entries(current.articles)) {
      const old = previous.articles[id];
      if (entity.deleted) {
        if (!old?.deleted) emit({ kind: 'entity.delete', entityType: 'article', entityId: id });
        continue;
      }
      for (const [field, value] of Object.entries(entity.fields)) {
        if (
          !old ||
          old.deleted ||
          canonicalJson(old.fields[field] ?? null) !== canonicalJson(value)
        ) {
          emit({ kind: 'entity.field.set', entityType: 'article', entityId: id, field, value });
        }
      }
    }
    for (const [id, entity] of Object.entries(current.categories)) {
      const old = previous.categories[id];
      if (entity.deleted) {
        if (!old?.deleted) emit({ kind: 'entity.delete', entityType: 'category', entityId: id });
        continue;
      }
      for (const [field, value] of Object.entries(entity.fields)) {
        if (
          !old ||
          old.deleted ||
          canonicalJson(old.fields[field] ?? null) !== canonicalJson(value)
        ) {
          emit({ kind: 'entity.field.set', entityType: 'category', entityId: id, field, value });
        }
      }
    }
    const oldMemberships = new Set(previous.memberships);
    const currentMemberships = new Set(current.memberships);
    for (const key of new Set([...oldMemberships, ...currentMemberships])) {
      const separator = key.indexOf(':');
      if (separator < 1) throw new Error('Invalid membership projection.');
      const article = key.slice(0, separator);
      const category = key.slice(separator + 1);
      const present = currentMemberships.has(key);
      if (present !== oldMemberships.has(key)) {
        emit({ kind: 'membership.set', articleId: article, categoryId: category, present });
      }
    }
    for (const snapshot of snapshots) {
      const fingerprint = current.snapshots[snapshot.id];
      if (fingerprint !== previous.snapshots[snapshot.id]) {
        emit({
          kind: 'snapshot.add',
          snapshotId: snapshot.id,
          articleId: snapshot.articleId,
          snapshot: jsonValue(snapshot),
        });
      }
    }

    for (const operation of newOperations) {
      transaction.objectStore('syncOperations').put(operation);
    }
    transaction.objectStore('syncMeta').put({ key: 'device-id', value: deviceId });
    transaction.objectStore('syncMeta').put({ key: 'projection', value: current });
    await transactionDone(transaction);
    return mergeOperationLogs(storedOperations, newOperations);
  }

  async getSyncOperations(): Promise<SyncOperation[]> {
    return mergeOperationLogs(await this.getAll<SyncOperation>('syncOperations'));
  }

  async storeSyncOperations(operations: readonly SyncOperation[]): Promise<void> {
    const transaction = this.database.transaction('syncOperations', 'readwrite');
    for (const operation of mergeOperationLogs(operations)) {
      transaction.objectStore('syncOperations').put(operation);
    }
    await transactionDone(transaction);
  }

  async getSyncLibraryId(): Promise<string | null> {
    return (await this.get<SyncMetaRecord<string>>('syncMeta', 'library-id'))?.value ?? null;
  }

  async associateSyncLibrary(libraryId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]+$/u.test(libraryId)) throw new Error('Invalid sync library ID.');
    const existing = await this.getSyncLibraryId();
    if (existing && existing !== libraryId) {
      throw new Error('This local library is already associated with a different sync library.');
    }
    await this.put('syncMeta', { key: 'library-id', value: libraryId });
  }

  async listSyncBlobs(): Promise<SyncBlob[]> {
    const metadata = await this.getAll<StoredBlob>('blobMeta');
    return Promise.all(
      metadata.map(async (blob) => ({
        id: blob.id,
        mediaType: blob.mediaType,
        bytes: await this.getBlobBytes(blob.id),
      })),
    );
  }

  async hasSyncBlob(id: BlobId): Promise<boolean> {
    return Boolean(await this.get<StoredBlob>('blobMeta', id));
  }

  async importSyncedBlob(id: BlobId, mediaType: string, bytes: Uint8Array): Promise<void> {
    if ((await sha256Hex(bytes)) !== id) throw new Error(`Synced blob hash mismatch for ${id}.`);
    await this.putBlob(bytes, mediaType);
  }

  async applySyncState(
    state: MaterializedSyncState,
    operations: readonly SyncOperation[],
  ): Promise<void> {
    if (state.conflicts.length) {
      throw new Error('Resolve sync conflicts before applying the materialized library.');
    }
    const articles = Object.entries(state.articles).map(([id, entity]) =>
      articleFromSync(id, entity),
    );
    const categories = Object.entries(state.categories).map(([id, entity]) =>
      categoryFromSync(id, entity),
    );
    const snapshots = Object.entries(state.snapshots).map(([id, value]) =>
      snapshotFromSync(id, value),
    );
    const now = new Date().toISOString();
    const memberships = state.memberships.map(
      ({ articleId: article, categoryId: category }) =>
        ({
          articleId: articleId(article),
          categoryId: categoryId(category),
          customFields: {},
          createdAt: now,
          updatedAt: now,
        }) satisfies CategoryMembership,
    );
    const articleIds = new Set(articles.map((article) => article.id));
    const categoryIds = new Set(categories.map((category) => category.id));
    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
    for (const article of articles) {
      if (!article.isDeleted && !snapshotIds.has(article.currentSnapshotId)) {
        throw new Error(`Synced article ${article.id} refers to a missing snapshot.`);
      }
    }
    for (const snapshot of snapshots) {
      if (!articleIds.has(snapshot.articleId)) {
        throw new Error(`Synced snapshot ${snapshot.id} refers to a missing article.`);
      }
    }
    for (const membership of memberships) {
      if (!articleIds.has(membership.articleId) || !categoryIds.has(membership.categoryId)) {
        throw new Error('Synced membership refers to a missing entity.');
      }
    }
    for (const blob of requiredSyncBlobs(state)) {
      if (!(await this.hasSyncBlob(blob.id))) {
        throw new Error(`Synced library is missing required blob ${blob.id}.`);
      }
    }
    const projection = buildSyncProjection(articles, categories, memberships, snapshots);
    const stores = [
      'articles',
      'categories',
      'snapshots',
      'memberships',
      'searchDocs',
      'syncOperations',
      'syncMeta',
    ];
    const transaction = this.database.transaction(stores, 'readwrite');
    // Read and check under the same write lock as replacement, including edits from other tabs.
    const [localArticles, localCategories, localMemberships, localSnapshots, localOps, saved] =
      await Promise.all([
        requestPromise(transaction.objectStore('articles').getAll()) as Promise<Article[]>,
        requestPromise(transaction.objectStore('categories').getAll()) as Promise<Category[]>,
        requestPromise(transaction.objectStore('memberships').getAll()) as Promise<
          CategoryMembership[]
        >,
        requestPromise(transaction.objectStore('snapshots').getAll()) as Promise<Snapshot[]>,
        requestPromise(transaction.objectStore('syncOperations').getAll()) as Promise<
          SyncOperation[]
        >,
        requestPromise(transaction.objectStore('syncMeta').get('projection')) as Promise<
          SyncMetaRecord<SyncProjection> | undefined
        >,
      ]);
    const localProjection = buildSyncProjection(
      localArticles,
      localCategories,
      localMemberships,
      localSnapshots,
    );
    const incoming = new Map(
      operations.map((operation) => [operation.operationId, canonicalJson(jsonValue(operation))]),
    );
    if (
      canonicalJson(jsonValue(localProjection)) !==
        canonicalJson(jsonValue(saved?.value ?? EMPTY_SYNC_PROJECTION)) ||
      localOps.some(
        (operation) => incoming.get(operation.operationId) !== canonicalJson(jsonValue(operation)),
      )
    ) {
      transaction.abort();
      throw new Error(
        'Local changes occurred during sync. They are safe; sync again to merge them.',
      );
    }
    for (const store of stores.slice(0, -1)) transaction.objectStore(store).clear();
    for (const article of articles) transaction.objectStore('articles').put(article);
    for (const category of categories) transaction.objectStore('categories').put(category);
    for (const snapshot of snapshots) transaction.objectStore('snapshots').put(snapshot);
    for (const membership of memberships) transaction.objectStore('memberships').put(membership);
    for (const operation of mergeOperationLogs(operations)) {
      transaction.objectStore('syncOperations').put(operation);
    }
    transaction.objectStore('syncMeta').put({ key: 'projection', value: projection });
    await transactionDone(transaction);
    await this.rebuildSearchIndex();
  }

  async getStorageStatus(): Promise<StorageStatus> {
    const persisted =
      typeof navigator !== 'undefined' && navigator.storage?.persisted
        ? await navigator.storage.persisted()
        : false;
    const estimate =
      typeof navigator !== 'undefined' && navigator.storage?.estimate
        ? await navigator.storage.estimate()
        : { usage: 0, quota: 0 };
    return {
      persisted,
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      blobBackend: this.blobBackend,
    };
  }

  async requestPersistence(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    try {
      return await Promise.race([
        navigator.storage.persist(),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 2000);
        }),
      ]);
    } catch {
      return false;
    }
  }

  private async putBlob(bytes: Uint8Array, mediaType: string): Promise<StoredBlob> {
    const id = blobId(await sha256Hex(bytes));
    const existing = await this.get<StoredBlob>('blobMeta', id);
    if (existing) return existing;
    let location: StoredBlob['location'] = 'indexeddb-fallback';
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (storage && 'getDirectory' in storage && typeof storage.getDirectory === 'function') {
      try {
        const root = await storage.getDirectory();
        const directory = await root.getDirectoryHandle('postkeeper-blobs', { create: true });
        const handle = await directory.getFileHandle(id, { create: true });
        const writable = await handle.createWritable();
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        await writable.write(copy);
        await writable.close();
        location = 'opfs';
      } catch {
        location = 'indexeddb-fallback';
      }
    }
    this.blobBackend = location;
    const meta: StoredBlob = { id, mediaType, byteLength: bytes.byteLength, location };
    const stores = location === 'indexeddb-fallback' ? ['blobMeta', 'blobBytes'] : ['blobMeta'];
    const transaction = this.database.transaction(stores, 'readwrite');
    transaction.objectStore('blobMeta').put(meta);
    if (location === 'indexeddb-fallback') {
      transaction
        .objectStore('blobBytes')
        .put({ id, bytes: bytes.slice() } satisfies BlobBytesRecord);
    }
    await transactionDone(transaction);
    return meta;
  }

  private async getBlobBytes(id: BlobId): Promise<Uint8Array> {
    const meta = await this.get<StoredBlob>('blobMeta', id);
    if (!meta) throw new Error(`Unknown blob ${id}.`);
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (
      meta.location === 'opfs' &&
      storage &&
      'getDirectory' in storage &&
      typeof storage.getDirectory === 'function'
    ) {
      try {
        const root = await storage.getDirectory();
        const directory = await root.getDirectoryHandle('postkeeper-blobs');
        const handle = await directory.getFileHandle(id);
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      } catch {
        // Fall through to IndexedDB.
      }
    }
    const record = await this.get<BlobBytesRecord>('blobBytes', id);
    if (!record) throw new Error(`Missing bytes for blob ${id}.`);
    return asBytes(record.bytes);
  }

  private async refreshSearchDoc(id: ArticleId): Promise<void> {
    const article = await this.requireArticle(id);
    const memberships = await this.getAll<CategoryMembership>('memberships');
    const names = new Map(
      (await this.listCategories()).map((category) => [category.id, category.name]),
    );
    const categoryNames = memberships
      .filter((membership) => membership.articleId === id)
      .map((membership) => names.get(membership.categoryId))
      .filter((value): value is string => Boolean(value));
    const existing = await this.get<SearchDoc>('searchDocs', id);
    const bodyText =
      existing?.bodyText ??
      extractSearchText(
        new TextDecoder().decode(
          await this.getBlobBytes(
            (await this.requireSnapshot(article.currentSnapshotId)).readerHtmlBlobId,
          ),
        ),
      );
    await this.put('searchDocs', {
      articleId: id,
      bodyText,
      text: composeSearchText(article, bodyText, categoryNames),
    } satisfies SearchDoc);
  }

  private async refreshSearchForCategory(id: CategoryId): Promise<void> {
    const memberships = (await this.getAll<CategoryMembership>('memberships')).filter(
      (membership) => membership.categoryId === id,
    );
    for (const membership of memberships) await this.refreshSearchDoc(membership.articleId);
  }

  private async requireArticle(id: ArticleId): Promise<Article> {
    const article = await this.get<Article>('articles', id);
    if (!article) throw new Error(`Unknown article ${id}.`);
    return article;
  }

  private async requireSnapshot(id: Snapshot['id']): Promise<Snapshot> {
    const snapshot = await this.get<Snapshot>('snapshots', id);
    if (!snapshot) throw new Error(`Unknown snapshot ${id}.`);
    return snapshot;
  }

  private async requireCategory(id: CategoryId): Promise<Category> {
    const category = await this.get<Category>('categories', id);
    if (!category || category.isDeleted) throw new Error(`Unknown category ${id}.`);
    return category;
  }

  private withCategories(
    article: Article,
    memberships: readonly CategoryMembership[],
    names: ReadonlyMap<CategoryId, string>,
  ): ArticleListItem {
    const categoryIds = memberships
      .filter((membership) => membership.articleId === article.id)
      .map((membership) => membership.categoryId)
      .filter((id) => names.has(id));
    return {
      ...article,
      categoryIds,
      categoryNames: categoryIds
        .map((id) => names.get(id))
        .filter((value): value is string => Boolean(value)),
    };
  }

  private getAll<T>(store: string): Promise<T[]> {
    return requestPromise(this.database.transaction(store).objectStore(store).getAll()) as Promise<
      T[]
    >;
  }

  private get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return requestPromise(this.database.transaction(store).objectStore(store).get(key)) as Promise<
      T | undefined
    >;
  }

  private async put<T>(store: string, value: T): Promise<void> {
    const transaction = this.database.transaction(store, 'readwrite');
    transaction.objectStore(store).put(value);
    await transactionDone(transaction);
  }
}

export async function openLibrary(options: OpenLibraryOptions = {}): Promise<Library> {
  return Library.open(options);
}
