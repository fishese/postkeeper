import { describe, expect, it } from 'vitest';
import { SyncProviderError } from '@postkeeper/sync-core';
import { HttpSyncObjectStore, normalizeSelfHostedEndpoint } from './store';

function json(value: unknown, init: ResponseInit = {}): Response {
  return Response.json(value, init);
}

describe('normalizeSelfHostedEndpoint', () => {
  it('requires HTTPS except for loopback development', () => {
    expect(normalizeSelfHostedEndpoint('https://nas.example.test/pocketbase')).toBe(
      'https://nas.example.test/pocketbase/',
    );
    expect(normalizeSelfHostedEndpoint('http://127.0.0.1:8090')).toBe('http://127.0.0.1:8090/');
    expect(() => normalizeSelfHostedEndpoint('http://nas.local:8090')).toThrow(/HTTPS/u);
    expect(() => normalizeSelfHostedEndpoint('https://user:pass@nas.example.test')).toThrow(
      /credentials/u,
    );
  });
});

describe('HttpSyncObjectStore', () => {
  it('uses the opaque object protocol for list, read, immutable, and conditional writes', async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if ((init.method ?? 'GET') === 'GET' && url.pathname.endsWith('/objects')) {
        return json({
          objects: [{ path: 'devices/a/1', etag: '"v1"', byteLength: 3 }],
          continuationToken: 'next',
        });
      }
      if ((init.method ?? 'GET') === 'GET') {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { etag: '"v1"', 'last-modified': 'Wed, 18 Sep 2026 00:00:00 GMT' },
        });
      }
      return json({
        status: new Headers(init.headers).get('if-match') ? 'updated' : 'created',
        object: { path: url.searchParams.get('path'), etag: '"v2"', byteLength: 2 },
      });
    }) as typeof fetch;
    const provider = new HttpSyncObjectStore({
      endpoint: 'https://nas.tailnet.ts.net/pb',
      accessToken: () => 'secret-token',
      fetch: fetcher,
    });

    await expect(provider.list('devices/', 'cursor')).resolves.toMatchObject({
      continuationToken: 'next',
      objects: [{ path: 'devices/a/1', byteLength: 3 }],
    });
    await expect(provider.get('devices/a/1')).resolves.toMatchObject({
      etag: '"v1"',
      bytes: new Uint8Array([1, 2, 3]),
    });
    await provider.putImmutable('blobs/a', new Uint8Array([4, 5]));
    await provider.putConditional('device-state/a', new Uint8Array([6, 7]), '"v1"');

    expect(calls[0]?.url.pathname).toBe('/pb/api/postkeeper/v1/objects');
    expect(calls[0]?.url.searchParams.get('cursor')).toBe('cursor');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('secret-token');
    expect(new Headers(calls[2]?.init.headers).get('if-none-match')).toBe('*');
    expect(new Headers(calls[3]?.init.headers).get('if-match')).toBe('"v1"');
    expect(calls.every((call) => call.init.credentials === 'omit')).toBe(true);
  });

  it('classifies authentication, conflicts, quota, and retryable failures', async () => {
    async function codeFor(status: number) {
      const provider = new HttpSyncObjectStore({
        endpoint: 'https://nas.example.test',
        accessToken: () => 'token-that-must-not-leak',
        fetch: (async () => json({ message: 'safe detail' }, { status })) as typeof fetch,
      });
      try {
        await provider.list('devices/');
      } catch (cause) {
        return cause as SyncProviderError;
      }
      throw new Error('Expected provider error.');
    }
    expect((await codeFor(401)).code).toBe('auth-required');
    expect((await codeFor(412)).code).toBe('conflict');
    expect((await codeFor(507)).code).toBe('quota');
    expect((await codeFor(503)).code).toBe('retryable');
    expect((await codeFor(401)).message).not.toContain('token-that-must-not-leak');
  });
});
