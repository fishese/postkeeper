import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import type { SyncDiagnostics } from './diagnostics';
import type { Library } from '@postkeeper/local-store';
import {
  createLibraryKeyMaterial,
  SyncProviderError,
  type LibraryKeyMaterial,
  type SyncObjectStore,
} from '@postkeeper/sync-core';
import { GoogleDriveObjectStore, GoogleIdentityAuthorizer } from '@postkeeper/sync-google-drive';
import {
  HttpSyncObjectStore,
  normalizeSelfHostedEndpoint,
  PocketBasePasswordAuthorizer,
} from '@postkeeper/sync-http';
import { loadGoogleIdentityServices } from './googleIdentity';
import {
  previewLibraryMerge,
  restoreLibraryFromRemote,
  synchronizeLibrary,
  type LibraryMergePreview,
} from './librarySync';
import { isNativeAndroid, nativeRequest } from './nativeBridge';
import {
  clearTrustedPocketBaseSession,
  loadTrustedPocketBaseSession,
  saveTrustedPocketBaseSession,
} from './trustedDevice';

type SyncPhase = 'local' | 'pending' | 'synced' | 'error' | 'conflict' | 'reconnect-required';
type SyncProviderKind = 'google-drive' | 'self-hosted';

const SELF_HOSTED_ENDPOINT_KEY = 'postkeeper.selfHosted.endpoint';
const SELF_HOSTED_IDENTITY_KEY = 'postkeeper.selfHosted.identity';

function savedSetting(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

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
  const pocketBaseAuthorizer = useRef<PocketBasePasswordAuthorizer | null>(null);
  const provider = useRef<SyncObjectStore | null>(null);
  const syncInFlight = useRef(false);
  const automaticSync = useRef<() => Promise<void>>(async () => undefined);
  const [providerKind, setProviderKind] = useState<SyncProviderKind>(() =>
    native ? 'self-hosted' : 'google-drive',
  );
  const [phase, setPhase] = useState<SyncPhase>('local');
  const [message, setMessage] = useState(t('syncPanel.localOnlySyncIsOptional'));
  const [connected, setConnected] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [loadingIdentity, setLoadingIdentity] = useState(false);
  const [keys, setKeys] = useState<LibraryKeyMaterial | null>(null);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [confirmedRecovery, setConfirmedRecovery] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [selfHostedEndpoint, setSelfHostedEndpoint] = useState(() =>
    savedSetting(SELF_HOSTED_ENDPOINT_KEY),
  );
  const [selfHostedIdentity, setSelfHostedIdentity] = useState(() =>
    savedSetting(SELF_HOSTED_IDENTITY_KEY),
  );
  const [selfHostedPassword, setSelfHostedPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [mergePreview, setMergePreview] = useState<LibraryMergePreview | null>(null);
  useEffect(() => {
    onDiagnosticsChange?.({ phase, connected, lastSuccess });
  }, [phase, connected, lastSuccess, onDiagnosticsChange]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadTrustedPocketBaseSession();
      if (!saved || cancelled) return;
      const auth = new PocketBasePasswordAuthorizer({ endpoint: saved.endpoint });
      auth.restore(saved.token);
      await auth.refresh();
      if (cancelled) return;
      pocketBaseAuthorizer.current = auth;
      provider.current = new HttpSyncObjectStore({
        endpoint: saved.endpoint,
        accessToken: () => auth.token(),
      });
      setProviderKind('self-hosted');
      setSelfHostedEndpoint(saved.endpoint);
      setSelfHostedIdentity(saved.identity);
      setKeys(saved.keys ? { ...saved.keys, recoveryKey: '' } : null);
      setConfirmedRecovery(Boolean(saved.keys));
      setConnected(true);
      setPhase('local');
      setMessage(t('syncPanel.rememberedDeviceReconnected'));
      await saveTrustedPocketBaseSession({ ...saved, token: auth.token() });
    })().catch(async (cause: unknown) => {
      if (cancelled) return;
      await clearTrustedPocketBaseSession().catch(() => undefined);
      if (cause instanceof SyncProviderError && cause.code === 'auth-required') {
        setPhase('reconnect-required');
        setMessage(t('syncPanel.rememberedSessionExpired'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function rememberPocketBase(keysToSave: LibraryKeyMaterial | null = keys) {
    const auth = pocketBaseAuthorizer.current;
    if (!rememberDevice || !auth || !selfHostedEndpoint || !selfHostedIdentity) return;
    try {
      await saveTrustedPocketBaseSession({
        endpoint: normalizeSelfHostedEndpoint(selfHostedEndpoint),
        identity: selfHostedIdentity.trim(),
        token: auth.token(),
        keys: keysToSave
          ? {
              masterKey: keysToSave.masterKey,
              libraryId: keysToSave.libraryId,
              remoteLayout: keysToSave.remoteLayout,
              wrappedMasterKey: keysToSave.wrappedMasterKey,
            }
          : null,
      });
    } catch {
      setRememberDevice(false);
      setMessage(t('syncPanel.couldNotRememberDevice'));
    }
  }

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

  async function connectGoogleDrive() {
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

  async function connectSelfHosted() {
    try {
      const endpoint = normalizeSelfHostedEndpoint(selfHostedEndpoint);
      const auth = new PocketBasePasswordAuthorizer({ endpoint });
      await auth.connect(selfHostedIdentity, selfHostedPassword);
      pocketBaseAuthorizer.current = auth;
      provider.current = new HttpSyncObjectStore({
        endpoint,
        accessToken: () => auth.token(),
      });
      try {
        localStorage.setItem(SELF_HOSTED_ENDPOINT_KEY, endpoint);
        localStorage.setItem(SELF_HOSTED_IDENTITY_KEY, selfHostedIdentity.trim());
      } catch {
        // Connection remains usable when preferences cannot be persisted.
      }
      setSelfHostedEndpoint(endpoint);
      setSelfHostedPassword('');
      setConnected(true);
      setPhase('local');
      setMessage(t('syncPanel.selfHostedConnectedLocalDataRemains'));
      await rememberPocketBase();
    } catch (cause) {
      showError(cause);
    }
  }

  async function createRecovery() {
    try {
      const created = await createLibraryKeyMaterial();
      setKeys(created);
      setConfirmedRecovery(false);
      setPhase('local');
      setMessage(t('syncPanel.recoveryKeyCreatedInMemorySave'));
    } catch (cause) {
      showError(cause);
    }
  }

  async function syncNow() {
    if (!provider.current || !keys || syncInFlight.current) return;
    syncInFlight.current = true;
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
      await rememberPocketBase(keys);
      await onLibraryChanged();
    } catch (cause) {
      showError(cause);
    } finally {
      syncInFlight.current = false;
    }
  }

  automaticSync.current = syncNow;

  useEffect(() => {
    if (!connected || !keys || !confirmedRecovery) return;
    const run = () => void automaticSync.current();
    const becameVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    const initial = window.setTimeout(run, 1_000);
    const interval = window.setInterval(run, 5 * 60 * 1_000);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', becameVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', becameVisible);
    };
  }, [connected, confirmedRecovery, keys]);

  async function restore() {
    if (!provider.current || !recoveryInput.trim()) return;
    setPhase('pending');
    setMessage(t('syncPanel.verifyingTheRecoveryKeyAndRestoring'));
    try {
      const stats = await library.getStats();
      if (stats.articles > 0 || stats.snapshots > 0) {
        setMergePreview(await previewLibraryMerge(library, provider.current, recoveryInput.trim()));
        setPhase('local');
        setMessage(t('syncPanel.mergePreviewReady'));
        return;
      }
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
      await rememberPocketBase(restored.keys);
      await onLibraryChanged();
    } catch (cause) {
      showError(cause);
    }
  }

  async function confirmMerge() {
    if (!provider.current || !recoveryInput.trim() || !mergePreview) return;
    setPhase('pending');
    setMessage(t('syncPanel.mergingLibraries'));
    try {
      const restored = await restoreLibraryFromRemote(
        library,
        provider.current,
        recoveryInput.trim(),
        undefined,
        { allowMerge: true },
      );
      setKeys(restored.keys);
      setMergePreview(null);
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
      await rememberPocketBase(restored.keys);
      await onLibraryChanged();
    } catch (cause) {
      showError(cause);
    }
  }

  async function disconnect() {
    await authorizer.current?.disconnect();
    pocketBaseAuthorizer.current?.disconnect();
    authorizer.current = null;
    pocketBaseAuthorizer.current = null;
    provider.current = null;
    await clearTrustedPocketBaseSession();
    setConnected(false);
    setIdentityReady(false);
    setPhase('local');
    setMessage(t('syncPanel.disconnectedTheLocalLibraryIsStill'));
  }

  function chooseProvider(next: SyncProviderKind) {
    void disconnect();
    setProviderKind(next);
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
        {t('syncPanel.optionalSyncSendsEncryptedLibraryDataTo')}{' '}
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
      <label>
        {t('syncPanel.provider')}
        <select
          value={providerKind}
          disabled={connected || phase === 'pending'}
          onChange={(event) => chooseProvider(event.target.value as SyncProviderKind)}
        >
          {!native && <option value="google-drive">{t('syncPanel.googleDrive')}</option>}
          <option value="self-hosted">{t('syncPanel.selfHostedPocketBase')}</option>
        </select>
      </label>
      {providerKind === 'google-drive' ? (
        !clientId ? (
          <p>{t('syncPanel.googleDriveSyncIsNotConfigured')}</p>
        ) : (
          <div className="sync-actions">
            {identityReady ? (
              <button
                type="button"
                onClick={() => void (connected ? disconnect() : connectGoogleDrive())}
              >
                {connected
                  ? t('syncPanel.disconnectGoogleDrive')
                  : t('syncPanel.connectGoogleDrive')}
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
        )
      ) : (
        <div className="stack self-hosted-connection">
          <p>{t('syncPanel.selfHostedConnectionHint')}</p>
          <label>
            {t('syncPanel.serverUrl')}
            <input
              type="url"
              value={selfHostedEndpoint}
              disabled={connected}
              placeholder={t('syncPanel.serverUrlExample')}
              onChange={(event) => setSelfHostedEndpoint(event.target.value)}
              autoComplete="url"
            />
          </label>
          <label>
            {t('syncPanel.identity')}
            <input
              value={selfHostedIdentity}
              disabled={connected}
              onChange={(event) => setSelfHostedIdentity(event.target.value)}
              autoComplete="username"
            />
          </label>
          {!connected && (
            <label>
              {t('syncPanel.password')}
              <input
                type="password"
                value={selfHostedPassword}
                onChange={(event) => setSelfHostedPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
          )}
          {!connected && (
            <label className="check">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
              />
              {t('syncPanel.rememberThisDevice')}
            </label>
          )}
          <div className="sync-actions">
            <button
              type="button"
              disabled={
                phase === 'pending' ||
                (!connected &&
                  (!selfHostedEndpoint.trim() || !selfHostedIdentity.trim() || !selfHostedPassword))
              }
              onClick={() => void (connected ? disconnect() : connectSelfHosted())}
            >
              {connected ? t('syncPanel.disconnectSelfHosted') : t('syncPanel.connectSelfHosted')}
            </button>
          </div>
        </div>
      )}
      <div className="sync-actions">
        <button type="button" onClick={() => void createRecovery()}>
          {t('syncPanel.createLibraryRecoveryKey')}
        </button>
      </div>
      {keys && (
        <div className="recovery-key-box">
          {keys.recoveryKey && (
            <>
              <label>
                {t('syncPanel.recoveryKeyStoreThisSomewhereSafe')}
                <textarea readOnly value={keys.recoveryKey} rows={3} data-testid="recovery-key" />
              </label>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(keys.recoveryKey!)}
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
            </>
          )}
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
        {mergePreview && (
          <div className="stack" role="status" data-testid="merge-preview">
            <p>
              {t('syncPanel.mergePreviewSummary', {
                localArticles: mergePreview.localArticles,
                localSnapshots: mergePreview.localSnapshots,
                remoteArticles: mergePreview.remoteArticles,
                remoteDeleted: mergePreview.remoteDeletedArticles,
                remoteSnapshots: mergePreview.remoteSnapshots,
                operations: mergePreview.remoteOperations,
                conflicts: mergePreview.conflicts,
              })}
            </p>
            <div className="sync-actions">
              <button type="button" onClick={() => void confirmMerge()}>
                {t('syncPanel.mergeAndEnableSync')}
              </button>
              <button type="button" onClick={() => setMergePreview(null)}>
                {t('syncPanel.cancelMerge')}
              </button>
            </div>
          </div>
        )}
      </div>
      {native && (
        <div className="sync-actions">
          <p>{t('syncPanel.optionalDeviceCopyAndroidEncryptsYour')}</p>
          <button
            disabled={!recoveryInput.trim() && !keys?.recoveryKey}
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
      <p className="sync-note">
        {providerKind === 'google-drive'
          ? t('syncPanel.driveReceivesEncryptedObjectsInIts')
          : t('syncPanel.selfHostedReceivesOnlyEncryptedObjects')}
      </p>
    </section>
  );
}
