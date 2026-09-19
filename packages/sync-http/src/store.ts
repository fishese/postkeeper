import {
  SyncProviderError,
  type PutResult,
  type RemoteObject,
  type RemoteObjectMetadata,
  type RemoteObjectPage,
  type SyncObjectStore,
} from '@postkeeper/sync-core';

const API_PATH = 'api/postkeeper/v1/';

export type HttpSyncObjectStoreOptions = {
  endpoint: string;
  accessToken: () => string | Promise<string>;
  fetch?: typeof fetch;
};

type ListResponse = {
  objects?: unknown;
  continuationToken?: unknown;
};

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function normalizeSelfHostedEndpoint(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid self-hosted server URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'The self-hosted server URL cannot contain credentials, a query, or a fragment.',
    );
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error(
      'Self-hosted sync requires HTTPS. Plain HTTP is allowed only for loopback testing.',
    );
  }
  url.pathname = `${url.pathname.replace(/\/*$/u, '')}/`;
  return url.toString();
}

function apiBase(endpoint: string): URL {
  return new URL(API_PATH, normalizeSelfHostedEndpoint(endpoint));
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function responseError(response: Response): Promise<SyncProviderError> {
  let detail = '';
  try {
    const body = (await response.clone().json()) as { message?: unknown };
    if (typeof body.message === 'string') detail = body.message.slice(0, 200);
  } catch {
    // Status is sufficient when the response is not JSON.
  }
  const message = `Self-hosted sync request failed (${response.status}${detail ? `: ${detail}` : ''}).`;
  if (response.status === 401 || response.status === 403) {
    return new SyncProviderError('auth-required', message);
  }
  if (response.status === 404) return new SyncProviderError('not-found', message);
  if (response.status === 409 || response.status === 412) {
    return new SyncProviderError('conflict', message);
  }
  if (response.status === 413 || response.status === 507) {
    return new SyncProviderError('quota', message);
  }
  if (response.status === 429 || response.status >= 500) {
    return new SyncProviderError('retryable', message, retryAfter(response));
  }
  return new SyncProviderError('invalid-response', message);
}

function metadata(value: unknown): RemoteObjectMetadata {
  if (!value || typeof value !== 'object') {
    throw new SyncProviderError(
      'invalid-response',
      'Self-hosted server returned invalid metadata.',
    );
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.path !== 'string' ||
    !candidate.path ||
    typeof candidate.etag !== 'string' ||
    !candidate.etag ||
    !Number.isSafeInteger(candidate.byteLength) ||
    Number(candidate.byteLength) < 0 ||
    (candidate.updatedAt !== undefined && typeof candidate.updatedAt !== 'string')
  ) {
    throw new SyncProviderError(
      'invalid-response',
      'Self-hosted server returned invalid metadata.',
    );
  }
  return {
    path: candidate.path,
    etag: candidate.etag,
    byteLength: Number(candidate.byteLength),
    ...(typeof candidate.updatedAt === 'string' ? { updatedAt: candidate.updatedAt } : {}),
  };
}

function requestBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class HttpSyncObjectStore implements SyncObjectStore {
  private readonly base: URL;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: HttpSyncObjectStoreOptions) {
    this.base = apiBase(options.endpoint);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private url(route: string): URL {
    return new URL(route, this.base);
  }

  private async request(url: URL, init: RequestInit = {}): Promise<Response> {
    const token = await this.options.accessToken();
    if (!token)
      throw new SyncProviderError('auth-required', 'Self-hosted sync needs reconnection.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', token);
    const response = await this.fetcher(url, { ...init, headers, credentials: 'omit' });
    if (!response.ok) throw await responseError(response);
    return response;
  }

  async list(prefix: string, continuationToken?: string): Promise<RemoteObjectPage> {
    const url = this.url('objects');
    url.searchParams.set('prefix', prefix);
    if (continuationToken) url.searchParams.set('cursor', continuationToken);
    const response = await this.request(url);
    let body: ListResponse;
    try {
      body = (await response.json()) as ListResponse;
    } catch {
      throw new SyncProviderError('invalid-response', 'Self-hosted server returned invalid JSON.');
    }
    if (!Array.isArray(body.objects)) {
      throw new SyncProviderError(
        'invalid-response',
        'Self-hosted server returned an invalid object list.',
      );
    }
    if (body.continuationToken !== undefined && typeof body.continuationToken !== 'string') {
      throw new SyncProviderError(
        'invalid-response',
        'Self-hosted server returned an invalid cursor.',
      );
    }
    return {
      objects: body.objects.map(metadata),
      ...(body.continuationToken ? { continuationToken: body.continuationToken } : {}),
    };
  }

  async get(path: string): Promise<RemoteObject> {
    const url = this.url('object');
    url.searchParams.set('path', path);
    const response = await this.request(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let etag = response.headers.get('etag');
    let listedMetadata: RemoteObjectMetadata | undefined;
    if (!etag) {
      // Older PostKeeper PocketBase hooks returned ETag without exposing it to
      // cross-origin browser JavaScript. The authenticated list response carries
      // the same value, so use it as a compatibility fallback.
      listedMetadata = (await this.list(path)).objects.find((object) => object.path === path);
      etag = listedMetadata?.etag ?? null;
      if (!etag) {
        throw new SyncProviderError(
          'invalid-response',
          'Self-hosted server omitted the object ETag.',
        );
      }
    }
    const lastModified = response.headers.get('last-modified') ?? listedMetadata?.updatedAt;
    return {
      path,
      etag,
      byteLength: bytes.byteLength,
      ...(lastModified ? { updatedAt: lastModified } : {}),
      bytes,
    };
  }

  private async put(
    path: string,
    bytes: Uint8Array,
    condition: { immutable: true } | { expectedEtag: string | null },
  ): Promise<PutResult> {
    const url = this.url('object');
    url.searchParams.set('path', path);
    const headers = new Headers({ 'Content-Type': 'application/octet-stream' });
    if ('immutable' in condition || condition.expectedEtag === null) {
      headers.set('If-None-Match', '*');
    } else {
      headers.set('If-Match', condition.expectedEtag);
    }
    const response = await this.request(url, {
      method: 'PUT',
      headers,
      body: requestBody(bytes),
    });
    let body: { status?: unknown; object?: unknown };
    try {
      body = (await response.json()) as { status?: unknown; object?: unknown };
    } catch {
      throw new SyncProviderError('invalid-response', 'Self-hosted server returned invalid JSON.');
    }
    if (!['created', 'existing', 'updated'].includes(String(body.status))) {
      throw new SyncProviderError(
        'invalid-response',
        'Self-hosted server returned an invalid write result.',
      );
    }
    return {
      status: body.status as PutResult['status'],
      object: metadata(body.object),
    };
  }

  putImmutable(path: string, bytes: Uint8Array): Promise<PutResult> {
    return this.put(path, bytes, { immutable: true });
  }

  putConditional(path: string, bytes: Uint8Array, expectedEtag: string | null): Promise<PutResult> {
    return this.put(path, bytes, { expectedEtag });
  }
}
