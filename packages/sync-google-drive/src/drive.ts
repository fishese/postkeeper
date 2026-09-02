import {
  SyncProviderError,
  type PutResult,
  type RemoteObject,
  type RemoteObjectMetadata,
  type RemoteObjectPage,
  type SyncObjectStore,
} from '@postkeeper/sync-core';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,version,size,modifiedTime';
const NAME_PREFIX = 'pk1~';

type DriveFile = {
  id?: string;
  name?: string;
  version?: string;
  size?: string;
  modifiedTime?: string;
};

type DriveFileList = { files?: DriveFile[]; nextPageToken?: string };

export type GoogleDriveObjectStoreOptions = {
  accessToken: () => string | Promise<string>;
  fetch?: typeof fetch;
  pageSize?: number;
};

function encodePath(path: string): string {
  if (!path || path.startsWith('/') || path.includes('..')) throw new Error('Invalid object path.');
  return `${NAME_PREFIX}${path.split('/').map(encodeURIComponent).join('~')}`;
}

function decodePath(name: string): string | null {
  if (!name.startsWith(NAME_PREFIX)) return null;
  try {
    return name.slice(NAME_PREFIX.length).split('~').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

function escapeDriveQuery(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function metadata(file: DriveFile, path: string, etag?: string | null): RemoteObjectMetadata {
  if (!file.id || !file.name || !file.version) {
    throw new SyncProviderError('invalid-response', 'Drive returned incomplete file metadata.');
  }
  const byteLength = Number(file.size ?? 0);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new SyncProviderError('invalid-response', 'Drive returned an invalid file size.');
  }
  return {
    path,
    etag: etag ?? `version:${file.version}`,
    byteLength,
    ...(file.modifiedTime ? { updatedAt: file.modifiedTime } : {}),
  };
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function driveError(response: Response): Promise<SyncProviderError> {
  let reason = '';
  try {
    const body = (await response.clone().json()) as {
      error?: { errors?: Array<{ reason?: string }>; message?: string };
    };
    reason = body.error?.errors?.[0]?.reason ?? body.error?.message ?? '';
  } catch {
    // The status code still provides a safe classification.
  }
  const message = `Google Drive request failed (${response.status}${reason ? `: ${reason}` : ''}).`;
  if (response.status === 401) return new SyncProviderError('auth-required', message);
  if (response.status === 404) return new SyncProviderError('not-found', message);
  if (response.status === 409 || response.status === 412) {
    return new SyncProviderError('conflict', message);
  }
  if (
    response.status === 429 ||
    response.status >= 500 ||
    ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason)
  ) {
    return new SyncProviderError('retryable', message, retryAfter(response));
  }
  if (
    [
      'storageQuotaExceeded',
      'teamDriveFileLimitExceeded',
      'activeItemCreationLimitExceeded',
    ].includes(reason)
  ) {
    return new SyncProviderError('quota', message);
  }
  if (response.status === 403) return new SyncProviderError('auth-required', message);
  return new SyncProviderError('invalid-response', message);
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function requestBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class GoogleDriveObjectStore implements SyncObjectStore {
  private readonly fetcher: typeof fetch;
  private readonly pageSize: number;

  constructor(private readonly options: GoogleDriveObjectStoreOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? 100;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.options.accessToken();
    if (!token) throw new SyncProviderError('auth-required', 'Google Drive needs reconnection.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await this.fetcher(url, { ...init, headers });
    if (!response.ok) throw await driveError(response);
    return response;
  }

  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.request(url, init);
    try {
      return (await response.json()) as T;
    } catch {
      throw new SyncProviderError('invalid-response', 'Google Drive returned invalid JSON.');
    }
  }

  private async findExact(path: string): Promise<DriveFile | null> {
    const name = encodePath(path);
    const query = `name = '${escapeDriveQuery(name)}' and trashed = false`;
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('q', query);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields', `files(${FILE_FIELDS})`);
    const result = await this.requestJson<DriveFileList>(url.toString());
    const matches = (result.files ?? [])
      .filter((file) => file.name === name && file.id)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return matches[0] ?? null;
  }

  async list(prefix: string, continuationToken?: string): Promise<RemoteObjectPage> {
    const encodedPrefix = encodePath(prefix);
    const query = `name contains '${escapeDriveQuery(encodedPrefix)}' and trashed = false`;
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('q', query);
    url.searchParams.set('pageSize', String(this.pageSize));
    url.searchParams.set('fields', `nextPageToken,files(${FILE_FIELDS})`);
    if (continuationToken) url.searchParams.set('pageToken', continuationToken);
    const result = await this.requestJson<DriveFileList>(url.toString());
    const objects = (result.files ?? []).flatMap((file) => {
      const path = file.name ? decodePath(file.name) : null;
      return path?.startsWith(prefix) ? [metadata(file, path)] : [];
    });
    return {
      objects,
      ...(result.nextPageToken ? { continuationToken: result.nextPageToken } : {}),
    };
  }

  async get(path: string): Promise<RemoteObject> {
    const file = await this.findExact(path);
    if (!file?.id) throw new SyncProviderError('not-found', `Remote object not found: ${path}`);
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      ...metadata({ ...file, size: String(bytes.byteLength) }, path, response.headers.get('etag')),
      bytes,
    };
  }

  private async create(path: string, bytes: Uint8Array): Promise<PutResult> {
    const boundary = `postkeeper-${crypto.randomUUID()}`;
    const metadataBody = JSON.stringify({
      name: encodePath(path),
      parents: ['appDataFolder'],
      mimeType: 'application/octet-stream',
    });
    const text = new TextEncoder();
    const body = concatenate([
      text.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataBody}\r\n`,
      ),
      text.encode(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      text.encode(`\r\n--${boundary}--\r\n`),
    ]);
    const url = `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`;
    const response = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: requestBody(body),
    });
    const file = (await response.json()) as DriveFile;
    return { status: 'created', object: metadata(file, path, response.headers.get('etag')) };
  }

  async putImmutable(path: string, bytes: Uint8Array): Promise<PutResult> {
    const existing = await this.findExact(path);
    if (existing) return { status: 'existing', object: metadata(existing, path) };
    return this.create(path, bytes);
  }

  async putConditional(
    path: string,
    bytes: Uint8Array,
    expectedEtag: string | null,
  ): Promise<PutResult> {
    const existing = await this.findExact(path);
    if (!existing) {
      if (expectedEtag !== null) {
        throw new SyncProviderError('conflict', `Remote object no longer exists: ${path}`);
      }
      return this.create(path, bytes);
    }
    if (expectedEtag === null) {
      throw new SyncProviderError('conflict', `Remote object already exists: ${path}`);
    }
    if (!existing.id) throw new SyncProviderError('invalid-response', 'Drive file has no ID.');
    const current = await this.get(path);
    if (current.etag !== expectedEtag) {
      throw new SyncProviderError('conflict', `Remote object changed: ${path}`);
    }
    const url = `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=${encodeURIComponent(FILE_FIELDS)}`;
    const response = await this.request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/octet-stream', 'If-Match': expectedEtag },
      body: requestBody(bytes),
    });
    const file = (await response.json()) as DriveFile;
    return { status: 'updated', object: metadata(file, path, response.headers.get('etag')) };
  }
}

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
