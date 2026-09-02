import { useEffect, useMemo } from 'react';
import { rewriteReaderHtml, type ReaderContent } from '@postkeeper/local-store';

export function Reader({ content }: { content: ReaderContent }) {
  const { srcDoc, revoke } = useMemo(() => {
    const urls = new Map<string, string>();
    const objectUrls: string[] = [];
    for (const asset of content.assets) {
      const copy = new Uint8Array(asset.bytes);
      const url = URL.createObjectURL(new Blob([copy], { type: asset.mediaType }));
      objectUrls.push(url);
      urls.set(asset.id, url);
    }
    const body = rewriteReaderHtml(content.html, urls);
    return {
      srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"><style>html,body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#17212b;background:#fff}img{max-width:100%;height:auto}a{pointer-events:none;color:#283618}</style></head><body>${body}</body></html>`,
      revoke: () => {
        for (const url of objectUrls) URL.revokeObjectURL(url);
      },
    };
  }, [content]);

  useEffect(() => revoke, [revoke]);

  return (
    <iframe
      className="reader-frame"
      title="Safe reader"
      sandbox=""
      referrerPolicy="no-referrer"
      data-testid="reader-frame"
      srcDoc={srcDoc}
    />
  );
}
