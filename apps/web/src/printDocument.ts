import printCss from './print.css?inline';
import { t } from './i18n';
import type { ReaderContent } from '@postkeeper/local-store';
import { createReaderDocument } from './readerDocument';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export const PRINT_CSS = printCss;

export function createPrintDocument(content: ReaderContent): string {
  const source = `<header class="print-source"><strong>${escapeHtml(content.article.title)}</strong><br>${escapeHtml(content.article.author)} · ${escapeHtml(content.article.siteName)}<br>${escapeHtml(content.article.originalUrl)}</header>`;
  return createReaderDocument(content)
    .replace('<head>', `<head><title>${escapeHtml(content.article.title)}</title>`)
    .replace('</head>', `<style>${PRINT_CSS}</style></head>`)
    .replace('<body>', `<body><p class="print-help">${escapeHtml(t('print.help'))}</p>${source}`);
}

/** Auxiliary windows inherit this creator frame's sandbox. Scripts and forms remain
 * forbidden, and the opener is severed before any article content is written. */
export async function openPrintWindow(
  documentHtml: string,
  launcher: HTMLIFrameElement | null,
): Promise<void> {
  const preview = launcher?.contentWindow?.open('', '_blank');
  if (!preview) {
    throw new Error(t('print.blocked'));
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
      warning.textContent = t('print.imageError');
      preview.document.body.prepend(warning);
    }
    preview.focus();
    preview.print();
  } catch (error) {
    if (!preview.closed) preview.close();
    throw error;
  }
}
