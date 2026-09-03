import { t } from './i18n';
import { useMemo } from 'react';
import type { ReaderContent } from '@postkeeper/local-store';
import { createReaderDocument } from './readerDocument';

export function Reader({ content }: { content: ReaderContent }) {
  const srcDoc = useMemo(() => createReaderDocument(content), [content]);

  return (
    <iframe
      className="reader-frame"
      title={t('reader.safeReader')}
      sandbox=""
      referrerPolicy="no-referrer"
      data-testid="reader-frame"
      srcDoc={srcDoc}
    />
  );
}
