import { t } from './i18n';
import { useState } from 'react';
import type { Article, Library } from '@postkeeper/local-store';
import { validateCapturePackage } from '@postkeeper/capture-format';
import { isNativeAndroid, nativeRequest } from './nativeBridge';

export function CaptureActions({
  article,
  library,
  onSaved,
}: {
  article: Article;
  library: Library;
  onSaved: (article: Article) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = article.warnings.includes('pending-link');
  async function capture() {
    setBusy(true);
    setMessage('');
    try {
      const info = await nativeRequest<{ length: number; id: string } | null>('capture', {
        url: article.originalUrl,
      });
      if (!info) return;
      if (!Number.isSafeInteger(info.length) || info.length > 20 * 1024 * 1024 || info.length <= 0)
        throw new Error(t('captureActions.captureIsTooLarge'));
      let text = '';
      for (let offset = 0; offset < info.length; offset += 48 * 1024)
        text += await nativeRequest<string>('captureChunk', { id: info.id, offset });
      const raw = JSON.parse(text);
      raw.assets = raw.assets.map((a: { base64: string }) => ({
        ...a,
        bytes: Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0)),
      }));
      const saved = await library.importCapturePackage(
        validateCapturePackage(raw),
        pending ? article.id : undefined,
      );
      await nativeRequest('ackCapture', { id: info.id });
      await onSaved(saved);
      setMessage(t('captureActions.pageSavedForOfflineReading'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('captureActions.captureFailed'));
    } finally {
      setBusy(false);
    }
  }
  if (!pending && !isNativeAndroid() && !message) return null;
  return (
    <div className={pending ? 'capture-warning' : 'capture-actions'}>
      {pending && (
        <p>
          <strong>{t('captureActions.pendingLink')}</strong>
          {t('captureActions.onlyTheUrlIsSavedCapture')}
        </p>
      )}
      {isNativeAndroid() && (
        <button disabled={busy} onClick={() => void capture()}>
          {busy ? t('captureActions.captureBrowserOpen') : t('captureActions.openCaptureBrowser')}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
