import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article, Library } from '@postkeeper/local-store';
import { nativeRequest, isNativeAndroid } from './nativeBridge';
import { Sheet } from './ui/Sheet';
import { t } from './i18n';

export function SharedLinks({
  library,
  onSaved,
  open,
  onClose,
}: {
  library: Library;
  onSaved: (article: Article) => Promise<void>;
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const processing = useRef(false);
  const accept = useCallback(
    async (input: { url?: string; title?: string; text?: string }) => {
      const article = await library.savePendingLink(input);
      await onSaved(article);
      setMessage(
        article.warnings.includes('pending-link')
          ? t('sharedLinks.linkSavedToYourInboxPage')
          : t('sharedLinks.thisPageIsAlreadyInYour'),
      );
      setUrl('');
    },
    [library, onSaved],
  );
  useEffect(() => {
    const receive = async () => {
      if (processing.current) return;
      processing.current = true;
      try {
        if (location.hash.startsWith('#share=')) {
          const raw = decodeURIComponent(location.hash.slice(7));
          if (raw.length > 32768) throw new Error(t('sharedLinks.sharedDataIsTooLarge'));
          await accept(JSON.parse(raw));
          history.replaceState(null, '', location.pathname + location.search);
        }
        if (isNativeAndroid()) {
          const item = await nativeRequest<{ id: string; text: string; title: string } | null>(
            'sharedLink',
          );
          if (item) {
            await accept({ text: item.text, title: item.title });
            await nativeRequest('ackShare', { id: item.id });
          }
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('sharedLinks.unableToSaveThisLink'));
      } finally {
        processing.current = false;
      }
    };
    void receive();
    window.addEventListener('hashchange', receive);
    window.addEventListener('postkeeper-native-share', receive);
    return () => {
      window.removeEventListener('hashchange', receive);
      window.removeEventListener('postkeeper-native-share', receive);
    };
  }, [accept]);
  return (
    <>
      <Sheet id="add-link" title={t('sharedLinks.saveALink')} open={open} onClose={onClose}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void accept({ url }).catch((error) => setMessage(error.message));
          }}
        >
          <label>
            {t('sharedLinks.pageUrl')}
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              maxLength={8192}
            />
          </label>
          <button className="primary" type="submit" aria-label={t('sharedLinks.saveLinkToInbox')}>
            {t('common.save')}
          </button>
        </form>
        {open && message && (
          <p className="transfer-status" role="status">
            {message}
          </p>
        )}
      </Sheet>
      {!open && message && (
        <p className="transfer-status" role="status">
          {message}
          <button
            className="icon-button"
            aria-label={t('common.close')}
            onClick={() => setMessage('')}
          >
            ×
          </button>
        </p>
      )}
    </>
  );
}
