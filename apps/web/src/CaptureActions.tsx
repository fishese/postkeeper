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
        throw new Error('Capture is too large.');
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
      setMessage('Page saved for offline reading.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Capture failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="capture-warning">
      {pending && (
        <p>
          <strong>Pending link</strong> — only the URL is saved. Open it in an extension-capable
          browser to capture it, or keep it as a bookmark.
        </p>
      )}
      {isNativeAndroid() && (
        <button disabled={busy} onClick={() => void capture()}>
          {busy ? 'Capture browser open…' : 'Open capture browser'}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
