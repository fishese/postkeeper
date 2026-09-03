import { t } from './i18n';
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
  const [message, setMessage] = useState(t('syncPanel.localOnlyGoogleDriveSyncIs'));
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
      setMessage(t('syncPanel.googleSignInIsReadySelect'));
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
      setMessage(t('syncPanel.googleDriveConnectedLocalDataRemains'));
    } catch (cause) {
      showError(cause);
    }
  }

  async function createRecovery() {
    try {
      setKeys(await createLibraryKeyMaterial());
      setConfirmedRecovery(false);
      setPhase('local');
      setMessage(t('syncPanel.recoveryKeyCreatedInMemorySave'));
    } catch (cause) {
      showError(cause);
    }
  }

  async function syncNow() {
    if (!provider.current || !keys) return;
    setPhase('pending');
    setMessage(t('syncPanel.encryptingLocalChangesAndSynchronizing'));
    try {
      const result = await synchronizeLibrary(library, provider.current, keys);
      if (result.state === 'conflict') {
        setPhase('conflict');
        setMessage(t('sync.conflicts', { count: result.materialized.conflicts.length }));
        return;
      }
      setPhase('synced');
      setLastSuccess(new Date().toISOString());
      setMessage(
        t('sync.result', {
          operations: result.operations.length,
          uploaded: result.uploaded,
          downloaded: result.downloaded,
          blobs: result.restoredBlobs,
        }),
      );
      await onLibraryChanged();
    } catch (cause) {
      showError(cause);
    }
  }

  async function restore() {
    if (!provider.current || !recoveryInput.trim()) return;
    setPhase('pending');
    setMessage(t('syncPanel.verifyingTheRecoveryKeyAndRestoring'));
    try {
      const restored = await restoreLibraryFromRemote(
        library,
        provider.current,
        recoveryInput.trim(),
      );
      setKeys(restored.keys);
      if (restored.result.state === 'conflict') {
        setPhase('conflict');
        setMessage(t('syncPanel.restoreRetainedConflictingSnapshotVariantsFor'));
        return;
      }
      setPhase('synced');
      setLastSuccess(new Date().toISOString());
      setMessage(
        t('sync.restored', {
          operations: restored.result.operations.length,
          blobs: restored.result.restoredBlobs,
        }),
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
    setMessage(t('syncPanel.disconnectedFromGoogleDriveTheLocal'));
  }

  return (
    <section className="sync-panel" aria-labelledby="sync-heading">
      <h3 className="visually-hidden" id="sync-heading">
        {t('syncPanel.encryptedSync')}
      </h3>
      <p className={`sync-state sync-state-${phase}`} role="status" data-testid="sync-state">
        <strong>{t(`sync.phase.${phase}`)}</strong> · {message}
      </p>
      <p className="sync-note">
        {t('syncPanel.optionalSyncSendsEncryptedLibraryData')}{' '}
        <a
          href={`${import.meta.env.BASE_URL}privacy.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('about.privacyPolicy')}
        </a>{' '}
        ·{' '}
        <a href={`${import.meta.env.BASE_URL}terms.html`} target="_blank" rel="noopener noreferrer">
          {t('about.termsOfService')}
        </a>{' '}
        {t('syncPanel.openInANewTab')}
      </p>
      {!clientId ? (
        <p>
          {native ? (
            t('syncPanel.googleDriveSyncIsAvailableIn')
          ) : (
            <>{t('syncPanel.googleDriveSyncIsNotConfigured')}</>
          )}
        </p>
      ) : (
        <div className="sync-actions">
          {identityReady ? (
            <button type="button" onClick={() => void (connected ? disconnect() : connect())}>
              {connected ? t('syncPanel.disconnectGoogleDrive') : t('syncPanel.connectGoogleDrive')}
            </button>
          ) : (
            <button
              type="button"
              disabled={loadingIdentity}
              onClick={() => void prepareConnection()}
            >
              {loadingIdentity
                ? t('syncPanel.loadingGoogleSignIn')
                : t('syncPanel.loadGoogleSignIn')}
            </button>
          )}
        </div>
      )}
      <div className="sync-actions">
        <button type="button" onClick={() => void createRecovery()}>
          {t('syncPanel.createLibraryRecoveryKey')}
        </button>
      </div>
      {keys && (
        <div className="recovery-key-box">
          <label>
            {t('syncPanel.recoveryKeyStoreThisSomewhereSafe')}
            <textarea readOnly value={keys.recoveryKey} rows={3} data-testid="recovery-key" />
          </label>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(keys.recoveryKey)}
          >
            {t('syncPanel.copyRecoveryKey')}
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmedRecovery}
              onChange={(event) => setConfirmedRecovery(event.target.checked)}
            />
            {t('syncPanel.iSavedTheRecoveryKeyLosing')}
          </label>
          <button
            type="button"
            disabled={!connected || !confirmedRecovery || phase === 'pending'}
            onClick={() => void syncNow()}
          >
            {t('syncPanel.syncNow')}
          </button>
        </div>
      )}
      <div className="restore-box">
        <label>
          {t('syncPanel.restoreOrUnlockWithARecovery')}
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
          {t('syncPanel.verifyAndRestore')}
        </button>
      </div>
      {native && (
        <div className="sync-actions">
          <p>{t('syncPanel.optionalDeviceCopyAndroidEncryptsYour')}</p>
          <button
            disabled={!recoveryInput.trim() && !keys}
            onClick={() =>
              void nativeRequest('saveKey', {
                key: recoveryInput.trim() || keys?.recoveryKey,
              }).then(() => setMessage(t('syncPanel.recoveryKeyEncryptedOnThisDevice')), showError)
            }
          >
            {t('syncPanel.saveKeyOnThisDevice')}
          </button>
          <button
            onClick={() =>
              void nativeRequest<string>('loadKey').then((value) => {
                setRecoveryInput(value);
                setMessage(t('syncPanel.deviceKeyLoadedIntoTheRecovery'));
              }, showError)
            }
          >
            {t('syncPanel.loadDeviceKey')}
          </button>
          <button
            onClick={() =>
              void nativeRequest('forgetKey').then(
                () => setMessage(t('syncPanel.deviceKeyCopyRemoved')),
                showError,
              )
            }
          >
            {t('syncPanel.forgetDeviceKey')}
          </button>
        </div>
      )}
      <p className="sync-note">{t('syncPanel.driveReceivesEncryptedObjectsInIts')}</p>
    </section>
  );
}
