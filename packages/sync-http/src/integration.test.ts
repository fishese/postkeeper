import { describe, expect, it } from 'vitest';
import {
  appendOperation,
  createDeviceOperationLog,
  createLibraryKeyMaterial,
  downloadEncryptedBlob,
  initializeRemoteLibrary,
  restoreLibraryKey,
  syncOperationLog,
  uploadEncryptedBlob,
} from '@postkeeper/sync-core';
import { HttpSyncObjectStore } from './store';

type Stored = { bytes: Uint8Array; version: number; updatedAt: string };

function fakeHttpServer() {
  const objects = new Map<string, Stored>();
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (new Headers(init.headers).get('authorization') !== 'test-token') {
      return Response.json({ message: 'Authentication required.' }, { status: 401 });
    }
    const method = init.method ?? 'GET';
    if (url.pathname.endsWith('/objects') && method === 'GET') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const cursor = url.searchParams.get('cursor') ?? '';
      const matches = [...objects.entries()]
        .filter(([path]) => path.startsWith(prefix) && path > cursor)
        .sort(([left], [right]) => left.localeCompare(right));
      const page = matches.slice(0, 1);
      return Response.json({
        objects: page.map(([path, stored]) => ({
          path,
          etag: `"v${stored.version}"`,
          byteLength: stored.bytes.byteLength,
          updatedAt: stored.updatedAt,
        })),
        ...(matches.length > page.length ? { continuationToken: page[0]?.[0] } : {}),
      });
    }
    const path = url.searchParams.get('path') ?? '';
    const existing = objects.get(path);
    if (method === 'GET') {
      if (!existing) return Response.json({ message: 'Not found.' }, { status: 404 });
      return new Response(existing.bytes.slice().buffer, {
        headers: { etag: `"v${existing.version}"`, 'last-modified': existing.updatedAt },
      });
    }
    if (method === 'PUT') {
      const headers = new Headers(init.headers);
      if (headers.get('if-none-match') === '*' && existing) {
        return Response.json({
          status: 'existing',
          object: {
            path,
            etag: `"v${existing.version}"`,
            byteLength: existing.bytes.byteLength,
            updatedAt: existing.updatedAt,
          },
        });
      }
      if (
        headers.get('if-match') &&
        (!existing || headers.get('if-match') !== `"v${existing.version}"`)
      ) {
        return Response.json({ message: 'Changed.' }, { status: 412 });
      }
      const bytes = new Uint8Array(init.body as ArrayBuffer);
      const stored = {
        bytes: bytes.slice(),
        version: (existing?.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      objects.set(path, stored);
      return Response.json(
        {
          status: existing ? 'updated' : 'created',
          object: {
            path,
            etag: `"v${stored.version}"`,
            byteLength: stored.bytes.byteLength,
            updatedAt: stored.updatedAt,
          },
        },
        { status: existing ? 200 : 201 },
      );
    }
    return new Response(null, { status: 405 });
  }) as typeof fetch;
  return { fetcher, objects };
}

describe('self-hosted encrypted sync contract', () => {
  it('syncs and restores the same operation/blob contract as Google Drive', async () => {
    const server = fakeHttpServer();
    const provider = new HttpSyncObjectStore({
      endpoint: 'https://nas.example.test',
      accessToken: () => 'test-token',
      fetch: server.fetcher,
    });
    const keys = await createLibraryKeyMaterial();
    await initializeRemoteLibrary(provider, keys);
    const log = createDeviceOperationLog('device-a');
    appendOperation(log, {
      kind: 'entity.field.set',
      entityType: 'article',
      entityId: 'article-a',
      field: 'title',
      value: 'Private self-hosted title',
    });
    const body = new TextEncoder().encode('<article>Private self-hosted body</article>');
    const blobPath = await uploadEncryptedBlob(
      provider,
      keys.masterKey,
      keys.libraryId,
      'a'.repeat(64),
      body,
    );
    await syncOperationLog(provider, keys.masterKey, keys.libraryId, log.operations);

    const restored = await restoreLibraryKey(provider, keys.recoveryKey);
    const clean = await syncOperationLog(provider, restored.masterKey, restored.libraryId, []);
    expect(clean.materialized.articles['article-a']?.values.title).toBe(
      'Private self-hosted title',
    );
    expect(
      await downloadEncryptedBlob(provider, restored.masterKey, restored.libraryId, blobPath),
    ).toEqual(body);
    const serverText = [...server.objects.values()]
      .map((value) => new TextDecoder().decode(value.bytes))
      .join('\n');
    expect(serverText).not.toContain('Private self-hosted title');
    expect(serverText).not.toContain('Private self-hosted body');
    expect(serverText).not.toContain('a'.repeat(64));
  });
});
