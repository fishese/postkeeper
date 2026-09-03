import { t } from './i18n';
import { useMemo, useRef, useState } from 'react';
import type { ReaderContent } from '@postkeeper/local-store';
import { originalHttpUrl } from './originalUrl';
import { createPrintDocument, openPrintWindow } from './printDocument';
import { isNativeAndroid, nativeRequest } from './nativeBridge';
import { Icon } from './ui/Icon';

export function ArticleSharing({ content }: { content: ReaderContent }) {
  const [message, setMessage] = useState('');
  const launcher = useRef<HTMLIFrameElement>(null);
  const printDocument = useMemo(() => createPrintDocument(content), [content]);
  const url = originalHttpUrl(content.article.originalUrl);
  async function copy() {
    try {
      if (!url || !navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(url);
      setMessage(t('articleSharing.originalUrlCopied'));
    } catch {
      setMessage(t('articleSharing.clipboardUnavailableSelectAndCopyThe'));
    }
  }
  return (
    <div className="sharing-actions">
      <iframe
        ref={launcher}
        title={t('articleSharing.printWindowLauncher')}
        hidden
        sandbox="allow-same-origin allow-modals allow-popups"
        referrerPolicy="no-referrer"
      />
      <div className="article-actions">
        {url && (
          <a
            className="icon-button"
            aria-label={t('articleSharing.openOriginalUrl')}
            title={t('articleSharing.openOriginalUrl')}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            <Icon name="external" />
          </a>
        )}
        <button
          className="icon-button"
          type="button"
          aria-label={t('articleSharing.copyOriginalUrl')}
          title={t('articleSharing.copyOriginalUrl')}
          disabled={!url}
          onClick={() => void copy()}
        >
          <Icon name="copy" />
        </button>
        <button
          className="icon-button"
          aria-label={t('articleSharing.printSaveAsPdf')}
          title={t('articleSharing.printSaveAsPdf')}
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
                    ? t('articleSharing.androidPrintPreviewOpened')
                    : t('articleSharing.printPreviewOpenedInASeparate'),
                ),
              (cause: unknown) =>
                setMessage(
                  cause instanceof Error ? cause.message : t('articleSharing.printingFailed'),
                ),
            )
          }
        >
          <Icon name="print" />
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
