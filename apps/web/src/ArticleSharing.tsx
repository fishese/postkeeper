import { useMemo, useRef, useState } from 'react';
import type { ReaderContent } from '@postkeeper/local-store';
import { originalHttpUrl } from './originalUrl';
import { createPrintDocument, openPrintWindow } from './printDocument';
import { isNativeAndroid, nativeRequest } from './nativeBridge';

export function ArticleSharing({ content }: { content: ReaderContent }) {
  const [message, setMessage] = useState('');
  const launcher = useRef<HTMLIFrameElement>(null);
  const printDocument = useMemo(() => createPrintDocument(content), [content]);
  const url = originalHttpUrl(content.article.originalUrl);
  async function copy() {
    try {
      if (!url || !navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(url);
      setMessage('Original URL copied.');
    } catch {
      setMessage('Clipboard unavailable. Select and copy the original URL shown above.');
    }
  }
  return (
    <div className="sharing-actions">
      <iframe
        ref={launcher}
        title="Print window launcher"
        hidden
        sandbox="allow-same-origin allow-modals allow-popups"
        referrerPolicy="no-referrer"
      />
      <div className="article-actions">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            Open original URL
          </a>
        )}
        <button type="button" disabled={!url} onClick={() => void copy()}>
          Copy original URL
        </button>
        <button
          type="button"
          onClick={() =>
            void (
              isNativeAndroid()
                ? nativeRequest('print', { html: printDocument })
                : openPrintWindow(printDocument, launcher.current)
            ).then(
              () =>
                setMessage(
                  isNativeAndroid()
                    ? 'Android print preview opened.'
                    : 'Print preview opened in a separate tab.',
                ),
              (cause: unknown) =>
                setMessage(cause instanceof Error ? cause.message : 'Printing failed.'),
            )
          }
        >
          Print / Save as PDF
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
