import { useEffect, useRef, useState } from 'react';
import type { SyncDiagnostics } from './diagnostics';
import type { Library } from '@postkeeper/local-store';
import {
  createLibraryKeyMaterial,
  SyncProviderError,
  type LibraryKeyMaterial,
} from '@postkeeper/sync-core';
import { GoogleDriveObjectStore, GoogleIdentityAuthorizer } from '@postkeeper/sync-google-drive';
import { loadGoogleIdentityServices } from './googleIdentity';
import { restoreLibraryFromRemote, synchronizeLibrary } from './librarySync';
import { isNativeAndroid, nativeRequest } from './nativeBridge';

type SyncPhase = 'local' | 'pending' | 'synced' | 'error' | 'conflict' | 'reconnect-required';

export function SyncPanel({
  library,
  onLibraryChanged,
  onDiagnosticsChange,
}: {
  library: Library;
  onLibraryChanged: () => Promise<void>;
  onDiagnosticsChange?: (value: SyncDiagnostics) => void;
}) {
  const native = isNativeAndroid();
  const clientId = native ? '' : (import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '');
  const authorizer = useRef<GoogleIdentityAuthorizer | null>(null);
  const provider = useRef<GoogleDriveObjectStore | null>(null);
  const [phase, setPhase] = useState<SyncPhase>('local');
  const [message, setMessage] = useState('Local only. Google Drive sync is optional.');
  const [connected, setConnected] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [loadingIdentity, setLoadingIdentity] = useState(false);
  const [keys, setKeys] = useState<LibraryKeyMaterial | null>(null);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [confirmedRecovery, setConfirmedRecovery] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  useEffect(() => {
    onDiagnosticsChange?.({ phase, connected, lastSuccess });
  }, [phase, connected, lastSuccess, onDiagnosticsChange]);

  function showError(cause: unknown) {
    const text = cause instanceof Error ? cause.message : String(cause);
    if (cause instanceof SyncProviderError && cause.code === 'auth-required') {
      setPhase('reconnect-required');
      setConnected(false);
    } else {
      setPhase('error');
    }
    setMessage(text);
  }

  async function prepareConnection() {
    setLoadingIdentity(true);
    try {
      const identity = await loadGoogleIdentityServices();
      authorizer.current = new GoogleIdentityAuthorizer(clientId, identity);
      setIdentityReady(true);
      setMessage('Google sign-in is ready. Select Connect Google Drive to authorize.');
    } catch (cause) {
      showError(cause);
    } finally {
      setLoadingIdentity(false);
    }
  }

  async function connect() {
    const auth = authorizer.current;
    if (!auth) return;
    try {
      // Keep requestAccessToken on the click stack; script loading happens in a prior action.
      await auth.connect();
      provider.current = new GoogleDriveObjectStore({ accessToken: () => auth.token() });
      setConnected(true);
      setPhase('local');
      setMessage('Google Drive connected. Local data remains authoritative until you sync.');
    } catch (cause) {
      showError(cause);
    }
  }

  async function createRecovery() {
    try {
      setKeys(await createLibraryKeyMaterial());
      setConfirmedRecovery(false);
      setPhase('local');
      setMessage('Recovery key created in memory. Save it before the first upload.');
    } catch (cause) {
      showError(cause);
    }
  }

  async function syncNow() {
    if (!provider.current || !keys) return;
    setPhase('pending');
    setMessage('Encrypting local changes and synchronizing…');
    try {
      const result = await synchronizeLibrary(library, provider.current, keys);
      if (result.state === 'conflict') {
        setPhase('conflict');
        setMessage(
          `${result.materialized.conflicts.length} conflict(s) need review; both variants were retained.`,
        );
        return;
      }
      setPhase('synced');
      setLastSuccess(new Date().toISOString());
      setMessage(
        `Synced ${result.operations.length} operation(s); uploaded ${result.uploaded}, downloaded ${result.downloaded}, restored ${result.restoredBlobs} blob(s).`,
      );
      await onLibraryChanged();
    } catch (cause) {
      showError(cause);
    }
  }

  async function restore() {
    if (!provider.current || !recoveryInput.trim()) return;
    setPhase('pending');
    setMessage('Verifying the recovery key and restoring encrypted data…');
    try {
      const restored = await restoreLibraryFromRemote(
        library,
        provider.current,
        recoveryInput.trim(),
      );
      setKeys(restored.keys);
      if (restored.result.state === 'conflict') {
        setPhase('conflict');
        setMessage('Restore retained conflicting snapshot variants for review.');
        return;
      }
      setPhase('synced');
      setLastSuccess(new Date().toISOString());
      setMessage(
        `Restore complete: ${restored.result.operations.length} operation(s), ${restored.result.restoredBlobs} blob(s).`,
      );
      await onLibraryChanged();
    } catch (cause) {
      showError(cause);
    }
  }

  async function disconnect() {
    await authorizer.current?.disconnect();
    authorizer.current = null;
    provider.current = null;
    setConnected(false);
    setIdentityReady(false);
    setPhase('local');
    setMessage('Disconnected from Google Drive. The local library is still usable.');
  }

  return (
    <section className="sync-panel" aria-labelledby="sync-heading">
      <h2 id="sync-heading">Encrypted sync</h2>
      <p className={`sync-state sync-state-${phase}`} role="status" data-testid="sync-state">
        <strong>{phase}</strong> · {message}
      </p>
      <p className="sync-note">
        Optional sync sends encrypted library data to your Google Drive.{' '}
        <a
          href={`${import.meta.env.BASE_URL}privacy.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>{' '}
        ·{' '}
        <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>{' '}
        (open in a new tab).
      </p>
      {!clientId ? (
        <p>
          {native ? (
            'Google Drive sync is available in the browser/PWA. This Android preview keeps its own local library; use a portable backup to transfer it.'
          ) : (
            <>
              This build has no Google OAuth client ID. Set <code>VITE_GOOGLE_CLIENT_ID</code> at
              build time to enable Drive sync.
            </>
          )}
        </p>
      ) : (
        <div className="sync-actions">
          {identityReady ? (
            <button type="button" onClick={() => void (connected ? disconnect() : connect())}>
              {connected ? 'Disconnect Google Drive' : 'Connect Google Drive'}
            </button>
          ) : (
            <button
              type="button"
              disabled={loadingIdentity}
              onClick={() => void prepareConnection()}
            >
              {loadingIdentity ? 'Loading Google sign-in…' : 'Load Google sign-in'}
            </button>
          )}
        </div>
      )}
      <div className="sync-actions">
        <button type="button" onClick={() => void createRecovery()}>
          Create library recovery key
        </button>
      </div>
      {keys && (
        <div className="recovery-key-box">
          <label>
            Recovery key — store this somewhere safe
            <textarea readOnly value={keys.recoveryKey} rows={3} data-testid="recovery-key" />
          </label>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(keys.recoveryKey)}
          >
            Copy recovery key
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmedRecovery}
              onChange={(event) => setConfirmedRecovery(event.target.checked)}
            />
            I saved the recovery key. Losing every copy makes remote data unrecoverable.
          </label>
          <button
            type="button"
            disabled={!connected || !confirmedRecovery || phase === 'pending'}
            onClick={() => void syncNow()}
          >
            Sync now
          </button>
        </div>
      )}
      <div className="restore-box">
        <label>
          Restore or unlock with a recovery key
          <textarea
            value={recoveryInput}
            onChange={(event) => setRecoveryInput(event.target.value)}
            rows={3}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          disabled={!connected || !recoveryInput.trim() || phase === 'pending'}
          onClick={() => void restore()}
        >
          Verify and restore
        </button>
      </div>
      {native && (
        <div className="sync-actions">
          <p>
            Optional device copy: Android encrypts your recovery key with Keystore. Keep a separate
            recovery copy. This does not enable Drive sync in the wrapper.
          </p>
          <button
            disabled={!recoveryInput.trim() && !keys}
            onClick={() =>
              void nativeRequest('saveKey', {
                key: recoveryInput.trim() || keys?.recoveryKey,
              }).then(() => setMessage('Recovery key encrypted on this device.'), showError)
            }
          >
            Save key on this device
          </button>
          <button
            onClick={() =>
              void nativeRequest<string>('loadKey').then((value) => {
                setRecoveryInput(value);
                setMessage('Device key loaded into the recovery field.');
              }, showError)
            }
          >
            Load device key
          </button>
          <button
            onClick={() =>
              void nativeRequest('forgetKey').then(
                () => setMessage('Device key copy removed.'),
                showError,
              )
            }
          >
            Forget device key
          </button>
        </div>
      )}
      <p className="sync-note">
        Drive receives encrypted objects in its hidden app-data folder. Keys and access tokens stay
        in memory for this session unless you explicitly save an encrypted Android device copy.
      </p>
    </section>
  );
}
