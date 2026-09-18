import { describe, expect, it } from 'vitest';
import { PocketBasePasswordAuthorizer } from './pocketbase';

describe('PocketBasePasswordAuthorizer', () => {
  it('authenticates without retaining or transmitting the password again', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const authorizer = new PocketBasePasswordAuthorizer({
      endpoint: 'https://nas.example.test/pb',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return Response.json({ token: 'pocketbase-token', record: { id: 'user-a' } });
      }) as typeof fetch,
    });
    await authorizer.connect('person@example.test', 'correct horse battery staple');
    expect(authorizer.token()).toBe('pocketbase-token');
    expect(calls[0]?.url).toBe(
      'https://nas.example.test/pb/api/collections/users/auth-with-password',
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      identity: 'person@example.test',
      password: 'correct horse battery staple',
    });
    authorizer.disconnect();
    expect(authorizer.token()).toBe('');
  });

  it('does not expose rejected credentials', async () => {
    const authorizer = new PocketBasePasswordAuthorizer({
      endpoint: 'https://nas.example.test',
      fetch: (async () => Response.json({}, { status: 400 })) as typeof fetch,
    });
    await expect(authorizer.connect('person@example.test', 'do-not-leak')).rejects.not.toThrow(
      /do-not-leak/u,
    );
  });

  it('refreshes a remembered ordinary-user token without storing a password', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const authorizer = new PocketBasePasswordAuthorizer({
      endpoint: 'https://nas.example.test',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return Response.json({ token: 'rotated-token' });
      }) as typeof fetch,
    });
    authorizer.restore('remembered-token');
    await authorizer.refresh();
    expect(calls).toEqual([
      {
        url: 'https://nas.example.test/api/collections/users/auth-refresh',
        authorization: 'remembered-token',
      },
    ]);
    expect(authorizer.token()).toBe('rotated-token');
  });

  it('explains a missing server migration on authentication 404', async () => {
    const authorizer = new PocketBasePasswordAuthorizer({
      endpoint: 'https://nas.example.test',
      fetch: (async () => Response.json({}, { status: 404 })) as typeof fetch,
    });
    await expect(authorizer.connect('person@example.test', 'secret')).rejects.toThrow(
      /users auth collection is missing/u,
    );
  });
});
