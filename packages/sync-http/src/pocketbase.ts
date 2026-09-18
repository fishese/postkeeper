import { SyncProviderError } from '@postkeeper/sync-core';
import { normalizeSelfHostedEndpoint } from './store';

export type PocketBasePasswordAuthorizerOptions = {
  endpoint: string;
  collection?: string;
  fetch?: typeof fetch;
};

export class PocketBasePasswordAuthorizer {
  private readonly endpoint: string;
  private readonly collection: string;
  private readonly fetcher: typeof fetch;
  private accessToken = '';

  constructor(options: PocketBasePasswordAuthorizerOptions) {
    this.endpoint = normalizeSelfHostedEndpoint(options.endpoint);
    this.collection = options.collection ?? 'postkeeper_users';
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  token(): string {
    return this.accessToken;
  }

  async connect(identity: string, password: string): Promise<void> {
    if (!identity.trim() || !password)
      throw new Error('Enter your PocketBase identity and password.');
    const url = new URL(
      `api/collections/${encodeURIComponent(this.collection)}/auth-with-password`,
      this.endpoint,
    );
    const response = await this.fetcher(url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: identity.trim(), password }),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new SyncProviderError(
          'auth-required',
          'PocketBase rejected the identity or password.',
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw new SyncProviderError('retryable', `PocketBase sign-in failed (${response.status}).`);
      }
      throw new SyncProviderError(
        'invalid-response',
        `PocketBase sign-in failed (${response.status}).`,
      );
    }
    let body: { token?: unknown };
    try {
      body = (await response.json()) as { token?: unknown };
    } catch {
      throw new SyncProviderError('invalid-response', 'PocketBase returned invalid sign-in JSON.');
    }
    if (typeof body.token !== 'string' || !body.token) {
      throw new SyncProviderError('invalid-response', 'PocketBase did not return an access token.');
    }
    this.accessToken = body.token;
  }

  disconnect(): void {
    this.accessToken = '';
  }
}
