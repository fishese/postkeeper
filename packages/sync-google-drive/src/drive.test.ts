import { describe, expect, it } from 'vitest';
import { SyncProviderError } from '@postkeeper/sync-core';
import { GOOGLE_DRIVE_APPDATA_SCOPE, GoogleDriveObjectStore } from './drive';

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

describe('GoogleDriveObjectStore', () => {
  it('lists only appDataFolder objects and preserves Drive pagination', async () => {
    const calls: URL[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      return json({
        files: [
          {
            id: 'id-1',
            name: 'pk1~devices~alpha~operations~0001.json',
            version: '7',
            size: '42',
          },
          { id: 'foreign', name: 'foreign', version: '1', size: '3' },
        ],
        nextPageToken: 'next',
      });
    }) as typeof fetch;
    const provider = new GoogleDriveObjectStore({ accessToken: () => 'token', fetch: fetcher });
    const page = await provider.list('devices/alpha/');
    expect(page.objects).toEqual([
      {
        path: 'devices/alpha/operations/0001.json',
        etag: 'version:7',
        byteLength: 42,
      },
    ]);
    expect(page.continuationToken).toBe('next');
    expect(calls[0]?.searchParams.get('spaces')).toBe('appDataFolder');
    expect(calls[0]?.searchParams.get('q')).toContain("name contains 'pk1~devices~alpha~'");

    await provider.list('devices/alpha/', 'next');
    expect(calls[1]?.searchParams.get('pageToken')).toBe('next');
  });

  it('creates files in appDataFolder using an authenticated multipart request', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (!init?.method) return json({ files: [] });
      return json(
        { id: 'created', name: 'pk1~blobs~remote', version: '1', size: '9' },
        { headers: { etag: '"etag-1"' } },
      );
    }) as typeof fetch;
    const provider = new GoogleDriveObjectStore({
      accessToken: () => 'secret-token',
      fetch: fetcher,
    });
    const result = await provider.putImmutable('blobs/remote', new Uint8Array([1, 2, 3]));
    expect(result.status).toBe('created');
    const upload = calls.find((call) => call.init?.method === 'POST');
    expect(new Headers(upload?.init?.headers).get('authorization')).toBe('Bearer secret-token');
    expect(upload?.url).toContain('uploadType=multipart');
    expect(new TextDecoder().decode(upload?.init?.body as Uint8Array)).toContain(
      '"parents":["appDataFolder"]',
    );
  });

  it('uses the downloaded ETag for a conditional update', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const file = { id: 'id-1', name: 'pk1~device-state~alpha', version: '2', size: '3' };
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('alt=media')) {
        return new Response(new Uint8Array([1, 2, 3]), { headers: { etag: '"etag-2"' } });
      }
      if (init?.method === 'PATCH') {
        return json({ ...file, version: '3', size: '2' }, { headers: { etag: '"etag-3"' } });
      }
      return json({ files: [file] });
    }) as typeof fetch;
    const provider = new GoogleDriveObjectStore({ accessToken: () => 'token', fetch: fetcher });
    const current = await provider.get('device-state/alpha');
    await provider.putConditional('device-state/alpha', new Uint8Array([4, 5]), current.etag);
    const update = calls.find((call) => call.init?.method === 'PATCH');
    expect(new Headers(update?.init?.headers).get('if-match')).toBe('"etag-2"');
  });

  it('classifies expiry, rate limits, and quota without exposing the token', async () => {
    async function errorFor(status: number, reason: string) {
      const provider = new GoogleDriveObjectStore({
        accessToken: () => 'do-not-leak',
        fetch: (async () =>
          json(
            { error: { errors: [{ reason }] } },
            { status, headers: { 'retry-after': '2' } },
          )) as typeof fetch,
      });
      try {
        await provider.list('devices/');
      } catch (cause) {
        return cause as SyncProviderError;
      }
      throw new Error('Expected provider error.');
    }
    expect((await errorFor(401, 'authError')).code).toBe('auth-required');
    const limited = await errorFor(429, 'rateLimitExceeded');
    expect(limited).toMatchObject({ code: 'retryable', retryAfterMs: 2000 });
    expect((await errorFor(403, 'storageQuotaExceeded')).code).toBe('quota');
    expect(limited.message).not.toContain('do-not-leak');
  });

  it('exports only the approved narrow scope', () => {
    expect(GOOGLE_DRIVE_APPDATA_SCOPE).toBe('https://www.googleapis.com/auth/drive.appdata');
  });
});
