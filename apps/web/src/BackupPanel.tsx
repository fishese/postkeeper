import { t, formatDate } from './i18n';
import { useEffect, useRef, useState } from 'react';
import {
  BACKUP_MAX_FILE_BYTES,
  discardBackup,
  stageBackup,
  type Library,
  type StagedBackup,
} from '@postkeeper/local-store';
import { createDiagnostics, type SyncDiagnostics } from './diagnostics';
import { isNativeAndroid, nativeRequest } from './nativeBridge';

async function download(text: string, name: string) {
  if (isNativeAndroid()) {
    await nativeRequest('exportStart');
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(offset + 48 * 1024, text.length);
      // Do not split UTF-16 pairs before native UTF-8 encoding.
      if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
      await nativeRequest('exportChunk', { text: text.slice(offset, end) });
      offset = end;
    }
    await nativeRequest('exportSave', { name });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Mobile download handoff can outlive the click task.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function BackupPanel({
  library,
  sync,
  onLibraryChanged,
}: {
  library: Library;
  sync: SyncDiagnostics;
  onLibraryChanged: () => Promise<void>;
}) {
  const [plaintext, setPlaintext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<StagedBackup | null>(null);
  const stageRef = useRef<StagedBackup | null>(null);
  const [message, setMessage] = useState('');
  const [diagnostics, setDiagnostics] = useState('');
  useEffect(
    () => () => {
      if (stageRef.current) discardBackup(stageRef.current);
    },
    [],
  );
  function cancel() {
    if (stageRef.current) discardBackup(stageRef.current);
    stageRef.current = null;
    setStage(null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch {
      setMessage(t('backupPanel.theOperationFailedNoBackupRecords'));
    } finally {
      setBusy(false);
    }
  }
  async function load(file: File) {
    cancel();
    if (file.size > BACKUP_MAX_FILE_BYTES) throw new Error(t('backupPanel.fileTooLarge'));
    const next = await stageBackup(await file.text());
    stageRef.current = next;
    setStage(next);
  }
  return (
    <section className="backup-panel" aria-labelledby="backup-heading">
      <h3 className="visually-hidden" id="backup-heading">
        {t('backupPanel.backupAndDiagnostics')}
      </h3>
      <p>{t('backupPanel.aPortableBackupContainsYourArticle')}</p>
      <label className="check">
        <input
          type="checkbox"
          checked={plaintext}
          onChange={(e) => setPlaintext(e.target.checked)}
        />
        {t('backupPanel.iChooseAPlaintextBackupContaining')}
      </label>
      <button
        disabled={busy || !plaintext}
        onClick={() =>
          void run(async () => {
            const text = await library.exportBackup({
              protection: 'plaintext',
              applicationVersion: __APP_VERSION__,
            });
            await download(text, `postkeeper-backup-${new Date().toISOString().slice(0, 10)}.json`);
            setMessage(t('backupPanel.backupReadyKeepTheDownloadedFile'));
          })
        }
      >
        {t('backupPanel.exportPortableBackup')}
      </button>
      <p>{t('backupPanel.importValidatesTheCompleteFileBefore')}</p>
      <label>
        {t('backupPanel.choosePostkeeperBackup')}
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(() => load(file));
          }}
        />
      </label>
      {stage && (
        <div role="status" className="backup-review">
          <p>
            {t('backup.review', {
              articles: stage.articles,
              categories: stage.categories,
              snapshots: stage.snapshots,
              blobs: stage.blobs,
              bytes: stage.byteLength,
              date: formatDate(stage.createdAt),
            })}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await library.commitBackup(stage);
                cancel();
                setMessage(t('backupPanel.backupImportedExistingLibraryRecordsAnd'));
                await onLibraryChanged().catch(() =>
                  setMessage(t('backupPanel.backupImportedSuccessfullyReloadTheApp')),
                );
              })
            }
          >
            {t('backupPanel.importValidatedBackup')}
          </button>{' '}
          <button disabled={busy} onClick={cancel}>
            {t('backupPanel.cancelImport')}
          </button>
        </div>
      )}
      <p>{t('backupPanel.diagnosticsIncludeCountsStorageUsageBrowser')}</p>
      <button
        disabled={busy}
        onClick={() => void run(async () => setDiagnostics(await createDiagnostics(library, sync)))}
      >
        {t('backupPanel.reviewLocalDiagnostics')}
      </button>
      {diagnostics && (
        <div>
          <pre className="diagnostics-preview">{diagnostics}</pre>
          <button
            onClick={() => void run(() => download(diagnostics, 'postkeeper-diagnostics.json'))}
          >
            {t('backupPanel.exportRedactedDiagnostics')}
          </button>
        </div>
      )}
      {busy && <p role="status">{t('backupPanel.workingLocally')}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
