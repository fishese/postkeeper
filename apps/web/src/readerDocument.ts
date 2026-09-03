import { SUPPORTED_CAPTURE_MEDIA_TYPES } from '@postkeeper/capture-format';
import { sanitizeStoredReaderHtml } from '@postkeeper/capture-processing';
import { rewriteReaderHtml, type ReaderContent } from '@postkeeper/local-store';

const supportedMediaTypes = new Set<string>(SUPPORTED_CAPTURE_MEDIA_TYPES);

function imageDataUrl(bytes: Uint8Array, mediaType: string): string {
  const chunks: string[] = [];
  // Keep argument counts bounded for large captured images on mobile browsers.
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return `data:${mediaType};base64,${btoa(chunks.join(''))}`;
}

export function createReaderDocument(content: Pick<ReaderContent, 'html' | 'assets'>): string {
  const urls = new Map<string, string>();
  for (const asset of content.assets) {
    // Never interpolate an untrusted MIME string into an HTML attribute.
    if (!supportedMediaTypes.has(asset.mediaType)) continue;
    urls.set(asset.id, imageDataUrl(asset.bytes, asset.mediaType));
  }
  const body = rewriteReaderHtml(sanitizeStoredReaderHtml(content.html), urls);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"><style>html,body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#17212b;background:#fff}img{max-width:100%;height:auto}a{pointer-events:none;color:#283618}</style></head><body>${body}</body></html>`;
}
