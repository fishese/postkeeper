import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import {
  validateCapturePackage,
  verifyCaptureAssetHashes,
  type CaptureMetadata,
  type CapturePackage,
} from '@postkeeper/capture-format';

export const CAPTURE_EXTRACTOR_VERSION = '@mozilla/readability@0.6.0';
export const CAPTURE_SANITIZER_VERSION = 'dompurify@3.4.14-postkeeper-html-v1';

/** Revalidate stored/synced/backup HTML at the presentation boundary. No producer markup
 * gets script, CSS, form, navigation, clobbering, or remote-resource capabilities. */
export function sanitizeStoredReaderHtml(html: string): string {
  return String(
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'article',
        'section',
        'div',
        'span',
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'a',
        'img',
        'figure',
        'figcaption',
        'blockquote',
        'pre',
        'code',
        'ul',
        'ol',
        'li',
        'dl',
        'dt',
        'dd',
        'table',
        'thead',
        'tbody',
        'tfoot',
        'tr',
        'td',
        'th',
        'caption',
        'strong',
        'em',
        'b',
        'i',
        's',
        'u',
        'small',
        'sup',
        'sub',
        'br',
        'hr',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|#|pk-blob:[a-f0-9]{64}$)/i,
    }),
  ).replace(/\ssrc="(?!pk-blob:[a-f0-9]{64}")[^"]*"/gi, '');
}

export type ExtractedReader = {
  html: string;
  metadata: Partial<CaptureMetadata>;
};

export type ProcessedCapture = {
  capture: CapturePackage;
  readerHtml: string;
  metadata: CaptureMetadata;
  warnings: string[];
  status: 'complete' | 'partial' | 'failed';
};

const forbiddenTags = [
  'audio',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'meta',
  'object',
  'option',
  'script',
  'select',
  'source',
  'style',
  'textarea',
  'track',
  'video',
];

const forbiddenAttributes = [
  'action',
  'background',
  'formaction',
  'poster',
  'srcdoc',
  'srcset',
  'style',
];

function parser(): DOMParser {
  if (typeof DOMParser === 'undefined') {
    throw new Error('Capture processing requires a DOM implementation.');
  }
  return new DOMParser();
}

function resolveHttpUrl(value: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(value, baseUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function prepareLazyImages(html: string): string {
  const document = parser().parseFromString(html, 'text/html');
  for (const image of Array.from(document.querySelectorAll('img'))) {
    if (!image.getAttribute('src')) {
      const lazySource =
        image.getAttribute('data-src') ??
        image.getAttribute('data-lazy-src') ??
        image.getAttribute('data-original');
      if (lazySource) image.setAttribute('src', lazySource);
    }
  }
  return document.body.innerHTML;
}

export function extractReaderFromDom(renderedDom: string, pageUrl: string): ExtractedReader | null {
  const document = parser().parseFromString(renderedDom, 'text/html');
  for (const image of Array.from(document.querySelectorAll('img'))) {
    for (const attribute of ['src', 'data-src', 'data-lazy-src', 'data-original']) {
      const value = image.getAttribute(attribute);
      if (!value) continue;
      const absolute = resolveHttpUrl(value, pageUrl);
      if (absolute) image.setAttribute(attribute, absolute);
    }
  }
  for (const link of Array.from(document.querySelectorAll('a[href]'))) {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) continue;
    const absolute = resolveHttpUrl(href, pageUrl);
    if (absolute) link.setAttribute('href', absolute);
  }
  const base = document.createElement('base');
  base.href = pageUrl;
  document.head.prepend(base);
  const result = new Readability(document.cloneNode(true) as Document, {
    charThreshold: 0,
    keepClasses: false,
    maxElemsToParse: 50_000,
  }).parse();
  if (!result?.content?.trim()) return null;
  return {
    html: result.content,
    metadata: {
      ...(result.title ? { title: result.title } : {}),
      ...(result.byline ? { author: result.byline } : {}),
      ...(result.siteName ? { siteName: result.siteName } : {}),
      ...(result.excerpt ? { excerpt: result.excerpt } : {}),
      ...(result.lang ? { language: result.lang } : {}),
      ...(result.publishedTime ? { publishedAt: result.publishedTime } : {}),
    },
  };
}

export function sanitizeAndRewriteReaderHtml(
  html: string,
  pageUrl: string,
  assets: readonly CapturePackage['assets'][number][],
): { html: string; warnings: string[] } {
  const clean = DOMPurify.sanitize(prepareLazyImages(html), {
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_ATTR: forbiddenAttributes,
    FORBID_TAGS: forbiddenTags,
    SANITIZE_DOM: true,
    USE_PROFILES: { html: true },
  });
  const document = parser().parseFromString(String(clean), 'text/html');
  const assetIds = new Map(assets.map((asset) => [new URL(asset.sourceUrl).href, asset.assetId]));
  const warnings: string[] = [];

  for (const image of Array.from(document.querySelectorAll('img'))) {
    const source = image.getAttribute('src');
    image.removeAttribute('srcset');
    image.removeAttribute('crossorigin');
    image.removeAttribute('referrerpolicy');
    for (const attribute of Array.from(image.attributes)) {
      if (attribute.name.startsWith('data-')) image.removeAttribute(attribute.name);
    }
    if (!source) continue;
    const absolute = resolveHttpUrl(source, pageUrl);
    const assetId = absolute ? assetIds.get(absolute) : undefined;
    if (assetId) image.setAttribute('src', `pk-asset:${assetId}`);
    else {
      image.removeAttribute('src');
      warnings.push(`missing-asset:${absolute ?? 'invalid-url'}`);
    }
  }

  for (const link of Array.from(document.querySelectorAll('a'))) {
    const href = link.getAttribute('href');
    link.removeAttribute('target');
    link.removeAttribute('ping');
    if (!href) continue;
    if (href.startsWith('#')) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      link.removeAttribute('href');
      continue;
    }
    if (!['http:', 'https:', 'mailto:'].includes(resolved.protocol)) {
      link.removeAttribute('href');
      continue;
    }
    link.setAttribute('href', resolved.href);
    link.setAttribute('rel', 'noreferrer noopener');
  }

  return { html: document.body.innerHTML, warnings: [...new Set(warnings)] };
}

export async function processCapturePackage(value: unknown): Promise<ProcessedCapture> {
  const capture = validateCapturePackage(value);
  await verifyCaptureAssetHashes(capture);
  const extracted = capture.extractedReaderHtml.trim()
    ? { html: capture.extractedReaderHtml, metadata: {} }
    : extractReaderFromDom(capture.renderedDom, capture.originalUrl);
  if (!extracted) {
    const warnings = [...new Set([...capture.warnings, 'extraction-failed'])];
    return {
      capture,
      readerHtml:
        '<article><p>Readable content could not be extracted from this capture.</p></article>',
      metadata: capture.metadata,
      warnings,
      status: 'failed',
    };
  }
  const processed = sanitizeAndRewriteReaderHtml(
    extracted.html,
    capture.originalUrl,
    capture.assets,
  );
  const warnings = [...new Set([...capture.warnings, ...processed.warnings])];
  return {
    capture,
    readerHtml: processed.html,
    metadata: { ...extracted.metadata, ...capture.metadata },
    warnings,
    status: warnings.length === 0 ? 'complete' : 'partial',
  };
}
