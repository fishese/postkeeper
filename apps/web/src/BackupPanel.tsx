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
      setMessage(
        'The operation failed. No backup records were committed. Check that the file is a valid, complete PostKeeper backup within the size limits, has no conflicting records, and that device storage has room.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function load(file: File) {
    cancel();
    if (file.size > BACKUP_MAX_FILE_BYTES) throw new Error('File too large');
    const next = await stageBackup(await file.text());
    stageRef.current = next;
    setStage(next);
  }
  return (
    <section className="backup-panel" aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup and diagnostics</h2>
      <p>
        A portable backup contains your article metadata, categories, every saved snapshot, and
        local images. Version 1 uses plaintext. Keep the file somewhere private; it is readable
        without a recovery key.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={plaintext}
          onChange={(e) => setPlaintext(e.target.checked)}
        />
        I choose a plaintext backup containing my saved content.
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
            setMessage('Backup ready. Keep the downloaded file private.');
          })
        }
      >
        Export portable backup
      </button>
      <p>
        Import validates the complete file before you confirm. It adds records and preserves
        existing records; conflicting IDs reject the whole import. To restore an older version with
        conflicting records, use an empty browser library. Sync settings and recovery keys are never
        imported. Limits: 128 MiB file, 64 MiB decoded content, 10 MiB per blob.
      </p>
      <label>
        Choose PostKeeper backup
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
            Validated backup: {stage.articles} articles, {stage.categories} categories,{' '}
            {stage.snapshots} snapshots, {stage.blobs} blobs ({stage.byteLength} bytes). Created{' '}
            {stage.createdAt}. The active library has not changed.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await library.commitBackup(stage);
                cancel();
                setMessage(
                  'Backup imported. Existing library records and sync settings were preserved.',
                );
                await onLibraryChanged().catch(() =>
                  setMessage(
                    'Backup imported successfully. Reload the app to refresh the library view.',
                  ),
                );
              })
            }
          >
            Import validated backup
          </button>{' '}
          <button disabled={busy} onClick={cancel}>
            Cancel import
          </button>
        </div>
      )}
      <p>
        Diagnostics include counts, storage usage, browser and processing versions, and sync status.
        Article content, URLs, credentials, and logs are omitted. Review before sharing.
      </p>
      <button
        disabled={busy}
        onClick={() => void run(async () => setDiagnostics(await createDiagnostics(library, sync)))}
      >
        Review local diagnostics
      </button>
      {diagnostics && (
        <div>
          <pre className="diagnostics-preview">{diagnostics}</pre>
          <button
            onClick={() => void run(() => download(diagnostics, 'postkeeper-diagnostics.json'))}
          >
            Export redacted diagnostics
          </button>
        </div>
      )}
      {busy && <p role="status">Working locally…</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
