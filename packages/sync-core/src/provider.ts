export type RemoteObjectMetadata = {
  path: string;
  etag: string;
  byteLength: number;
  updatedAt?: string;
};

export type RemoteObject = RemoteObjectMetadata & {
  bytes: Uint8Array;
};

export type RemoteObjectPage = {
  objects: RemoteObjectMetadata[];
  continuationToken?: string;
};

export type PutResult = {
  status: 'created' | 'existing' | 'updated';
  object: RemoteObjectMetadata;
};

export interface SyncObjectStore {
  list(prefix: string, continuationToken?: string): Promise<RemoteObjectPage>;
  get(path: string): Promise<RemoteObject>;
  putImmutable(path: string, bytes: Uint8Array): Promise<PutResult>;
  putConditional(path: string, bytes: Uint8Array, expectedEtag: string | null): Promise<PutResult>;
}

export type SyncProviderErrorCode =
  'auth-required' | 'conflict' | 'not-found' | 'quota' | 'retryable' | 'invalid-response';

export class SyncProviderError extends Error {
  constructor(
    readonly code: SyncProviderErrorCode,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SyncProviderError';
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function etagFor(version: number): string {
  return `"memory-${version}"`;
}

type MemoryRecord = { bytes: Uint8Array; version: number; updatedAt: string };

/** Deterministic provider used for sync integration tests and offline demos. */
export class MemorySyncObjectStore implements SyncObjectStore {
  private readonly records = new Map<string, MemoryRecord>();
  private writesBeforeFailure: number | null = null;

  constructor(private readonly pageSize = 100) {}

  failAfterWrites(count: number): void {
    this.writesBeforeFailure = count;
  }

  private beforeWrite(): void {
    if (this.writesBeforeFailure === null) return;
    if (this.writesBeforeFailure === 0) {
      this.writesBeforeFailure = null;
      throw new SyncProviderError('retryable', 'Simulated interrupted write.');
    }
    this.writesBeforeFailure -= 1;
  }

  async list(prefix: string, continuationToken?: string): Promise<RemoteObjectPage> {
    const offset = continuationToken ? Number.parseInt(continuationToken, 10) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new SyncProviderError('invalid-response', 'Invalid continuation token.');
    }
    const matches = [...this.records.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right));
    const page = matches.slice(offset, offset + this.pageSize).map(([path, record]) => ({
      path,
      etag: etagFor(record.version),
      byteLength: record.bytes.byteLength,
      updatedAt: record.updatedAt,
    }));
    const next = offset + page.length;
    return {
      objects: page,
      ...(next < matches.length ? { continuationToken: String(next) } : {}),
    };
  }

  async get(path: string): Promise<RemoteObject> {
    const record = this.records.get(path);
    if (!record) throw new SyncProviderError('not-found', `Remote object not found: ${path}`);
    return {
      path,
      bytes: copyBytes(record.bytes),
      etag: etagFor(record.version),
      byteLength: record.bytes.byteLength,
      updatedAt: record.updatedAt,
    };
  }

  async putImmutable(path: string, bytes: Uint8Array): Promise<PutResult> {
    const existing = this.records.get(path);
    if (existing) {
      return {
        status: 'existing',
        object: {
          path,
          etag: etagFor(existing.version),
          byteLength: existing.bytes.byteLength,
          updatedAt: existing.updatedAt,
        },
      };
    }
    this.beforeWrite();
    const record = { bytes: copyBytes(bytes), version: 1, updatedAt: new Date().toISOString() };
    this.records.set(path, record);
    return {
      status: 'created',
      object: {
        path,
        etag: etagFor(record.version),
        byteLength: bytes.byteLength,
        updatedAt: record.updatedAt,
      },
    };
  }

  async putConditional(
    path: string,
    bytes: Uint8Array,
    expectedEtag: string | null,
  ): Promise<PutResult> {
    const existing = this.records.get(path);
    if (expectedEtag === null && existing) {
      throw new SyncProviderError('conflict', `Remote object already exists: ${path}`);
    }
    if (expectedEtag !== null && (!existing || etagFor(existing.version) !== expectedEtag)) {
      throw new SyncProviderError('conflict', `Remote object changed: ${path}`);
    }
    this.beforeWrite();
    const record = {
      bytes: copyBytes(bytes),
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(path, record);
    return {
      status: existing ? 'updated' : 'created',
      object: {
        path,
        etag: etagFor(record.version),
        byteLength: bytes.byteLength,
        updatedAt: record.updatedAt,
      },
    };
  }
}
