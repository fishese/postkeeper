import { SyncProviderError } from '@postkeeper/sync-core';
import { GOOGLE_DRIVE_APPDATA_SCOPE } from './drive';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken(config?: { prompt?: string }): void;
};

type GoogleIdentityOAuth2 = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }): TokenClient;
  revoke(token: string, callback: () => void): void;
};

export type GoogleIdentityProvider = { accounts: { oauth2: GoogleIdentityOAuth2 } };

export type GoogleConnectionState =
  | { state: 'disconnected' }
  | { state: 'connected'; expiresAt: number }
  | { state: 'reconnect-required'; reason: string };

/** Holds a GIS access token in memory only. Call connect directly from a user action. */
export class GoogleIdentityAuthorizer {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private connectionState: GoogleConnectionState = { state: 'disconnected' };

  constructor(
    private readonly clientId: string,
    private readonly identity: GoogleIdentityProvider,
    private readonly now: () => number = Date.now,
  ) {
    if (!clientId.trim()) throw new Error('Google OAuth client ID cannot be empty.');
  }

  get state(): GoogleConnectionState {
    if (this.accessToken && this.expiresAt <= this.now()) {
      this.accessToken = null;
      this.connectionState = {
        state: 'reconnect-required',
        reason: 'Google access expired. Reconnect to sync; local data is still available.',
      };
    }
    return this.connectionState;
  }

  connect(prompt = ''): Promise<GoogleConnectionState> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        this.accessToken = null;
        this.connectionState = { state: 'reconnect-required', reason: message };
        reject(new SyncProviderError('auth-required', message));
      };
      const client = this.identity.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: GOOGLE_DRIVE_APPDATA_SCOPE,
        include_granted_scopes: false,
        callback: (response) => {
          if (settled) return;
          if (!response.access_token || response.error) {
            fail(response.error_description ?? response.error ?? 'Google authorization failed.');
            return;
          }
          settled = true;
          const lifetime = Math.max(1, Number(response.expires_in ?? 3600));
          const lifetimeMs = lifetime * 1000;
          const expirySafetyMargin = Math.min(30_000, lifetimeMs / 10);
          this.accessToken = response.access_token;
          this.expiresAt = this.now() + lifetimeMs - expirySafetyMargin;
          this.connectionState = { state: 'connected', expiresAt: this.expiresAt };
          resolve(this.connectionState);
        },
        error_callback: (error) =>
          fail(`Google authorization was interrupted (${error.type ?? 'unknown'}).`),
      });
      client.requestAccessToken({ prompt });
    });
  }

  token(): string {
    const state = this.state;
    if (state.state !== 'connected' || !this.accessToken) {
      throw new SyncProviderError(
        'auth-required',
        state.state === 'reconnect-required' ? state.reason : 'Connect Google Drive to sync.',
      );
    }
    return this.accessToken;
  }

  markRevoked(): void {
    this.accessToken = null;
    this.connectionState = {
      state: 'reconnect-required',
      reason: 'Google access was revoked. Reconnect to sync; local data is still available.',
    };
  }

  disconnect(): Promise<void> {
    const token = this.accessToken;
    this.accessToken = null;
    this.connectionState = { state: 'disconnected' };
    if (!token) return Promise.resolve();
    return new Promise((resolve) => this.identity.accounts.oauth2.revoke(token, resolve));
  }
}
