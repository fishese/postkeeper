import { useCallback, useEffect, useRef, useState } from 'react';
import type { Article, Library } from '@postkeeper/local-store';
import { nativeRequest, isNativeAndroid } from './nativeBridge';

export function SharedLinks({
  library,
  onSaved,
}: {
  library: Library;
  onSaved: (article: Article) => Promise<void>;
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
          ? 'Link saved to your inbox. Page content has not been captured.'
          : 'This page is already in your library.',
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
          if (raw.length > 32768) throw new Error('Shared data is too large.');
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
        setMessage(error instanceof Error ? error.message : 'Unable to save this link.');
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
    <section className="backup-panel" aria-labelledby="share-heading">
      <h2 id="share-heading">Save a link</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void accept({ url }).catch((error) => setMessage(error.message));
        }}
      >
        <label>
          Page URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            maxLength={8192}
          />
        </label>
        <button type="submit">Save link to inbox</button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
