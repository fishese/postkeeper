import { describe, expect, it } from 'vitest';
import { GOOGLE_DRIVE_APPDATA_SCOPE } from './drive';
import { GoogleIdentityAuthorizer, type GoogleIdentityProvider } from './identity';

describe('GoogleIdentityAuthorizer', () => {
  it('requests only appDataFolder access and keeps a short-lived token in memory', async () => {
    let scope = '';
    const identity: GoogleIdentityProvider = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            scope = config.scope;
            expect(config.include_granted_scopes).toBe(false);
            return {
              requestAccessToken() {
                config.callback({ access_token: 'temporary', expires_in: 60 });
              },
            };
          },
          revoke(_token, callback) {
            callback();
          },
        },
      },
    };
    let now = 1_000_000;
    const authorizer = new GoogleIdentityAuthorizer('client-id', identity, () => now);
    await authorizer.connect();
    expect(scope).toBe(GOOGLE_DRIVE_APPDATA_SCOPE);
    expect(authorizer.token()).toBe('temporary');
    now += 55_001;
    expect(() => authorizer.token()).toThrow(/expired/u);
    expect(authorizer.state.state).toBe('reconnect-required');
  });

  it('turns revocation or popup interruption into reconnect-required state', async () => {
    let errorCallback: ((error: { type?: string }) => void) | undefined;
    const identity: GoogleIdentityProvider = {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            errorCallback = config.error_callback;
            return { requestAccessToken: () => errorCallback?.({ type: 'popup_closed' }) };
          },
          revoke(_token, callback) {
            callback();
          },
        },
      },
    };
    const authorizer = new GoogleIdentityAuthorizer('client-id', identity);
    await expect(authorizer.connect()).rejects.toThrow(/interrupted/u);
    expect(authorizer.state.state).toBe('reconnect-required');
    authorizer.markRevoked();
    expect(() => authorizer.token()).toThrow(/revoked/u);
  });
});
