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
import { GoogleDriveObjectStore } from './drive';

type FakeFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  version: number;
  modifiedTime: string;
};

function fakeDriveApi() {
  const files = new Map<string, FakeFile>();
  let nextId = 1;
  const metadata = (file: FakeFile) => ({
    id: file.id,
    name: file.name,
    version: String(file.version),
    size: String(file.bytes.byteLength),
    modifiedTime: file.modifiedTime,
  });
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (new Headers(init.headers).get('authorization') !== 'Bearer test-token') {
      return new Response(JSON.stringify({ error: { errors: [{ reason: 'authError' }] } }), {
        status: 401,
      });
    }
    if (url.pathname === '/drive/v3/files' && (init.method ?? 'GET') === 'GET') {
      const query = url.searchParams.get('q') ?? '';
      const exact = /name = '([^']+)'/u.exec(query)?.[1];
      const contains = /name contains '([^']+)'/u.exec(query)?.[1];
      const matching = [...files.values()]
        .filter((file) =>
          exact ? file.name === exact : contains ? file.name.includes(contains) : true,
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      const offset = Number(url.searchParams.get('pageToken') ?? 0);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 100);
      const page = matching.slice(offset, offset + pageSize);
      const next = offset + page.length;
      return Response.json({
        files: page.map(metadata),
        ...(next < matching.length ? { nextPageToken: String(next) } : {}),
      });
    }
    const mediaId = /^\/drive\/v3\/files\/([^/]+)$/u.exec(url.pathname)?.[1];
    if (mediaId && url.searchParams.get('alt') === 'media') {
      const file = files.get(decodeURIComponent(mediaId));
      if (!file) return new Response(null, { status: 404 });
      return new Response(file.bytes.slice().buffer, {
        headers: { etag: `"fake-${file.version}"` },
      });
    }
    if (url.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      const contentType = new Headers(init.headers).get('content-type') ?? '';
      const boundary = /boundary=([^;]+)/u.exec(contentType)?.[1];
      if (!boundary) return new Response(null, { status: 400 });
      const body = new TextDecoder().decode(init.body as ArrayBuffer);
      const sections = body.split(`--${boundary}`);
      const metadataText = sections[1]?.split('\r\n\r\n')[1]?.replace(/\r\n$/u, '');
      const content = sections[2]?.split('\r\n\r\n')[1]?.replace(/\r\n$/u, '');
      if (!metadataText || content === undefined) return new Response(null, { status: 400 });
      const upload = JSON.parse(metadataText) as { name: string; parents: string[] };
      if (upload.parents[0] !== 'appDataFolder') return new Response(null, { status: 400 });
      const file: FakeFile = {
        id: `file-${nextId++}`,
        name: upload.name,
        bytes: new TextEncoder().encode(content),
        version: 1,
        modifiedTime: new Date().toISOString(),
      };
      files.set(file.id, file);
      return Response.json(metadata(file), { headers: { etag: '"fake-1"' } });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return { fetcher, files };
}

describe('Google Drive encrypted sync contract', () => {
  it('syncs and restores operations and selected content through appDataFolder REST calls', async () => {
    const fake = fakeDriveApi();
    const provider = new GoogleDriveObjectStore({
      accessToken: () => 'test-token',
      fetch: fake.fetcher,
      pageSize: 1,
    });
    const keys = await createLibraryKeyMaterial();
    await initializeRemoteLibrary(provider, keys);
    const log = createDeviceOperationLog('device-a');
    appendOperation(log, {
      kind: 'entity.field.set',
      entityType: 'article',
      entityId: 'article-a',
      field: 'title',
      value: 'Private Drive title',
    });
    const body = new TextEncoder().encode('<article>Private Drive body</article>');
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
    expect(clean.materialized.articles['article-a']?.values.title).toBe('Private Drive title');
    expect(
      await downloadEncryptedBlob(provider, restored.masterKey, restored.libraryId, blobPath),
    ).toEqual(body);
    const rawDriveText = [...fake.files.values()]
      .map((file) => new TextDecoder().decode(file.bytes))
      .join('\n');
    expect(rawDriveText).not.toContain('Private Drive title');
    expect(rawDriveText).not.toContain('Private Drive body');
    expect(rawDriveText).not.toContain('a'.repeat(64));
  });
});
