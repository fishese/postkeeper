export {
  Library,
  openLibrary,
  requiredSyncBlobs,
  rewriteReaderHtml,
  type ArticleListItem,
  type LibraryStats,
  type OpenLibraryOptions,
  type ReaderContent,
  type RequiredSyncBlob,
  type StorageStatus,
  type SyncBlob,
  type TrustedAsset,
  type TrustedFixture,
} from './library';

export type { Article, Category, CategoryId, LibraryView, Snapshot } from './library';

export type BlobStoreKind = 'opfs' | 'indexeddb-fallback';
export {
  BACKUP_FORMAT_VERSION,
  BACKUP_MAX_FILE_BYTES,
  stageBackup,
  discardBackup,
  type StagedBackup,
} from './backup';
