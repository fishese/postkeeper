import type { ReaderContent } from '@postkeeper/local-store';
import { createReaderDocument } from './readerDocument';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export const PRINT_CSS = `
  @media screen { body { max-width: 180mm; padding: 1rem; margin: auto; } }
  .print-help { font: 14px/1.5 system-ui,sans-serif; padding: 1em; background: #eef2df; }
  @media print { .print-help { display: none; } }
  @page { size: auto; margin: 16mm; }
  html, body { margin: 0; font: 11pt/1.5 Georgia, serif; color: #000; background: #fff; }
  body { overflow-wrap: anywhere; }
  h1,h2,h3,h4,h5,h6 { break-after: avoid; page-break-after: avoid; line-height: 1.2; }
  h1 { font-size: 23pt; } h2 { font-size: 17pt; } h3 { font-size: 14pt; }
  p,li { orphans: 3; widows: 3; }
  img { max-width: 100%; max-height: 230mm; object-fit: contain; height: auto; break-inside: avoid; }
  figure, tr { break-inside: avoid; }
  figure { margin: 1em 0; } table { border-collapse: collapse; width: 100%; }
  td,th { border: 1px solid #aaa; padding: .3em; } thead { display: table-header-group; }
  pre { white-space: pre-wrap; } blockquote { margin-inline: 1em; }
  a { color: #000; text-decoration: underline; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; overflow-wrap: anywhere; }
  .print-source { border-bottom: 1px solid #aaa; padding-bottom: .8em; margin-bottom: 1.2em; font: 10pt/1.5 system-ui,sans-serif; }
`;

export function createPrintDocument(content: ReaderContent): string {
  const source = `<header class="print-source"><strong>${escapeHtml(content.article.title)}</strong><br>${escapeHtml(content.article.author)} · ${escapeHtml(content.article.siteName)}<br>${escapeHtml(content.article.originalUrl)}</header>`;
  return createReaderDocument(content)
    .replace('<head>', `<head><title>${escapeHtml(content.article.title)}</title>`)
    .replace('</head>', `<style>${PRINT_CSS}</style></head>`)
    .replace(
      '<body>',
      `<body><p class="print-help">Print preview. If no dialog opens, use the browser menu or Share → Print, then choose Save as PDF. Close this tab to return to your library.</p>${source}`,
    );
}

/** Auxiliary windows inherit this creator frame's sandbox. Scripts and forms remain
 * forbidden, and the opener is severed before any article content is written. */
export async function openPrintWindow(
  documentHtml: string,
  launcher: HTMLIFrameElement | null,
): Promise<void> {
  const preview = launcher?.contentWindow?.open('', '_blank');
  if (!preview) {
    throw new Error('Allow this app to open a print window, then try again.');
  }
  preview.opener = null;
  try {
    preview.document.open();
    preview.document.write(documentHtml);
    preview.document.close();
    await Promise.all(
      [...preview.document.images].map((img) => img.decode().catch(() => undefined)),
    );
    if (preview.closed) return;
    if ([...preview.document.images].some((img) => !img.naturalWidth)) {
      const warning = preview.document.createElement('p');
      warning.textContent = 'An image could not be decoded. The preview shows what will print.';
      preview.document.body.prepend(warning);
    }
    preview.focus();
    preview.print();
  } catch (error) {
    if (!preview.closed) preview.close();
    throw error;
  }
}
