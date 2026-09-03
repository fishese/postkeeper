import type { Article, Category, CategoryMembership, Snapshot } from '@postkeeper/domain';
import { sha256Hex, SUPPORTED_CAPTURE_MEDIA_TYPES } from '@postkeeper/capture-format';
import { canonicalJson, type JsonValue } from '@postkeeper/sync-core';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_BLOB_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const HTML_TYPE = 'text/html;charset=utf-8';
const mediaTypes = new Set<string>([HTML_TYPE, ...SUPPORTED_CAPTURE_MEDIA_TYPES]);

export type BackupMetadata = {
  articles: Article[];
  categories: Category[];
  memberships: CategoryMembership[];
  snapshots: Snapshot[];
};
export type BackupBlob = { id: string; mediaType: string; byteLength: number; base64: string };
export type BackupPayload = BackupMetadata & { blobs: BackupBlob[] };
export type BackupEnvelope = {
  format: 'postkeeper-backup';
  formatVersion: 1;
  applicationVersion: string;
  createdAt: string;
  protection: 'plaintext';
  payload: BackupPayload;
  sha256: string;
};
export type StagedBackup = Readonly<{
  articles: number;
  categories: number;
  snapshots: number;
  blobs: number;
  byteLength: number;
  createdAt: string;
}>;
const stages = new WeakMap<
  StagedBackup,
  { payload: BackupPayload; bytes: Map<string, Uint8Array> }
>();

function invalid(): never {
  // Do not echo attacker-controlled fields, filenames, or parse errors into diagnostics/UI.
  throw new Error('Invalid or unsupported PostKeeper backup. The active library was not changed.');
}
type Check = (value: unknown) => boolean;
const string: Check = (v) => typeof v === 'string' && v.length <= 16_384;
const short: Check = (v) => typeof v === 'string' && v.length <= 256;
const id: Check = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(v);
const hash: Check = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const bool: Check = (v) => typeof v === 'boolean';
const date: Check = (v) =>
  typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const url: Check = (v) => {
  if (!string(v)) return false;
  try {
    const parsed = new URL(v as string);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
};
const nullable =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);
const array =
  (check: Check, max = 10_000): Check =>
  (v) =>
    Array.isArray(v) && v.length <= max && v.every(check);
const shape =
  (fields: Record<string, Check>): Check =>
  (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const record = v as Record<string, unknown>;
    return (
      Object.keys(record).length === Object.keys(fields).length &&
      Object.entries(fields).every(
        ([key, check]) => Object.hasOwn(record, key) && check(record[key]),
      )
    );
  };

const articleFields: Record<keyof Article, Check> = {
  id,
  originalUrl: url,
  canonicalUrl: url,
  title: string,
  author: string,
  siteName: string,
  excerpt: string,
  language: short,
  publishedAt: nullable(date),
  savedAt: date,
  updatedAt: date,
  isRead: bool,
  isFavorite: bool,
  isArchived: bool,
  isDeleted: bool,
  currentSnapshotId: id,
  captureStatus: (v) => ['complete', 'partial', 'failed'].includes(v as string),
  warnings: array(string, 1000),
  schemaVersion: (v) => v === 1,
};
const categoryFields: Record<keyof Category, Check> = {
  id,
  name: string,
  sortOrder: (v) => typeof v === 'number' && Number.isSafeInteger(v),
  parentId: (v) => v === null,
  viewTemplate: (v) => v === 'list',
  isDeleted: bool,
};
const membershipFields: Record<keyof CategoryMembership, Check> = {
  articleId: id,
  categoryId: id,
  customFields: shape({}),
  createdAt: date,
  updatedAt: date,
};
const assetFields = {
  blobId: hash,
  originalSrc: string,
  mediaType: (v: unknown) => SUPPORTED_CAPTURE_MEDIA_TYPES.includes(v as never),
};
const snapshotFields: Record<keyof Snapshot, Check> = {
  id,
  articleId: id,
  capturedAt: date,
  captureMethod: short,
  readerHtmlBlobId: hash,
  rawDomBlobId: nullable(hash),
  assetManifest: array(shape(assetFields), 1000),
  contentHash: hash,
  extractorVersion: short,
  sanitizerVersion: short,
};

function pick<T>(value: T, fields: Record<string, Check>): T {
  return Object.fromEntries(
    Object.keys(fields).map((key) => [key, (value as Record<string, unknown>)[key]]),
  ) as T;
}

/** Explicit schema projection: never serialize database stores or arbitrary extra properties. */
export function portableMetadata(value: BackupMetadata): BackupMetadata {
  return {
    articles: value.articles.map((v) => pick(v, articleFields)),
    categories: value.categories.map((v) => pick(v, categoryFields)),
    memberships: value.memberships.map((v) => ({ ...pick(v, membershipFields), customFields: {} })),
    snapshots: value.snapshots.map((v) => ({
      ...pick(v, snapshotFields),
      assetManifest: v.assetManifest.map((a) => pick(a, assetFields)),
    })),
  };
}

export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000)
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  return btoa(parts.join(''));
}

export function backupCanonical(value: unknown): string {
  return canonicalJson(value as JsonValue);
}

export async function createBackup(
  payload: BackupPayload,
  applicationVersion: string,
): Promise<string> {
  const unsigned = {
    format: 'postkeeper-backup' as const,
    formatVersion: BACKUP_FORMAT_VERSION,
    applicationVersion,
    createdAt: new Date().toISOString(),
    protection: 'plaintext' as const,
    payload,
  };
  const serialized = JSON.stringify({
    ...unsigned,
    sha256: await sha256Hex(new TextEncoder().encode(backupCanonical(unsigned))),
  });
  // Export is held to exactly the same bounds and integrity rules as import.
  await stageBackup(serialized);
  return serialized;
}

export async function stageBackup(text: string): Promise<StagedBackup> {
  if (
    text.length > BACKUP_MAX_FILE_BYTES ||
    new TextEncoder().encode(text).length > BACKUP_MAX_FILE_BYTES
  )
    invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid();
  }
  if (
    !shape({
      format: (v) => v === 'postkeeper-backup',
      formatVersion: (v) => v === 1,
      applicationVersion: short,
      createdAt: date,
      protection: (v) => v === 'plaintext',
      sha256: hash,
      payload: shape({
        articles: array(shape(articleFields)),
        categories: array(shape(categoryFields)),
        memberships: array(shape(membershipFields), 50_000),
        snapshots: array(shape(snapshotFields), 50_000),
        blobs: array(
          shape({
            id: hash,
            mediaType: (v) => mediaTypes.has(v as string),
            byteLength: (v) =>
              Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_BLOB_BYTES,
            base64: (v) => typeof v === 'string' && v.length <= Math.ceil(MAX_BLOB_BYTES / 3) * 4,
          }),
          50_000,
        ),
      }),
    })(parsed)
  )
    invalid();
  const envelope = parsed as BackupEnvelope;
  const { sha256, ...unsigned } = envelope;
  if ((await sha256Hex(new TextEncoder().encode(backupCanonical(unsigned)))) !== sha256) invalid();
  const payload = envelope.payload;
  const unique = <T>(items: T[], key: (v: T) => string): Map<string, T> => {
    const map = new Map(items.map((v) => [key(v), v]));
    if (map.size !== items.length) invalid();
    return map;
  };
  const articles = unique(payload.articles, (v) => v.id);
  const categories = unique(payload.categories, (v) => v.id);
  const snapshots = unique(payload.snapshots, (v) => v.id);
  const blobs = unique(payload.blobs, (v) => v.id);
  unique(payload.memberships, (v) => `${v.articleId}:${v.categoryId}`);
  const referenced = new Set<string>();
  const requireBlob = (id: string, mediaType: string) => {
    if (blobs.get(id)?.mediaType !== mediaType) invalid();
    referenced.add(id);
  };
  for (const article of articles.values()) {
    if (snapshots.get(article.currentSnapshotId)?.articleId !== article.id) invalid();
  }
  for (const snapshot of snapshots.values()) {
    if (!articles.has(snapshot.articleId) || snapshot.contentHash !== snapshot.readerHtmlBlobId)
      invalid();
    requireBlob(snapshot.readerHtmlBlobId, HTML_TYPE);
    if (snapshot.rawDomBlobId) requireBlob(snapshot.rawDomBlobId, HTML_TYPE);
    for (const asset of snapshot.assetManifest) requireBlob(asset.blobId, asset.mediaType);
  }
  for (const membership of payload.memberships) {
    if (!articles.has(membership.articleId) || !categories.has(membership.categoryId)) invalid();
  }
  if (referenced.size !== blobs.size) invalid();
  const bytes = new Map<string, Uint8Array>();
  let byteLength = 0;
  for (const blob of blobs.values()) {
    byteLength += blob.byteLength;
    if (byteLength > MAX_TOTAL_BYTES || /[^A-Za-z0-9+/=]/u.test(blob.base64)) invalid();
    let decoded: Uint8Array;
    try {
      decoded = Uint8Array.from(atob(blob.base64), (c) => c.charCodeAt(0));
    } catch {
      invalid();
    }
    if (
      decoded.length !== blob.byteLength ||
      encodeBase64(decoded) !== blob.base64 ||
      (await sha256Hex(decoded)) !== blob.id
    )
      invalid();
    bytes.set(blob.id, decoded);
  }
  const stage = Object.freeze({
    articles: articles.size,
    categories: categories.size,
    snapshots: snapshots.size,
    blobs: blobs.size,
    byteLength,
    createdAt: envelope.createdAt,
  });
  stages.set(stage, { payload, bytes });
  return stage;
}

// Internal to local-store: consumers receive only an opaque, immutable summary.
export function stagedBackupData(stage: StagedBackup) {
  const data = stages.get(stage);
  if (!data) invalid();
  return data;
}

export function discardBackup(stage: StagedBackup): void {
  stages.delete(stage);
}
