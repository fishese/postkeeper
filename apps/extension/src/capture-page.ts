import { Readability } from '@mozilla/readability';
import { CAPTURE_LIMITS } from '@postkeeper/capture-format';
import type { PageCaptureDraft } from './messages';

const SENSITIVE_PATTERN = /(authorization|cookie|csrf|password|secret|session|token)/i;

function firstMeta(document: Document, ...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = document.querySelector<HTMLMetaElement>(selector)?.content.trim();
    if (value) return value;
  }
  return undefined;
}

function absoluteHttpUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function createCredentialScrubbedClone(document: Document): Document {
  const clone = document.cloneNode(true) as Document;
  for (const element of Array.from(clone.querySelectorAll('script, input, textarea, select'))) {
    element.remove();
  }
  for (const meta of Array.from(clone.querySelectorAll('meta'))) {
    if (
      SENSITIVE_PATTERN.test(
        `${meta.getAttribute('name') ?? ''} ${meta.getAttribute('property') ?? ''}`,
      )
    ) {
      meta.remove();
    }
  }
  for (const element of Array.from(clone.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (SENSITIVE_PATTERN.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  }
  return clone;
}

function collectAssetUrls(document: Document, baseUrl: string): string[] {
  const urls = new Set<string>();
  const add = (value: string | null | undefined) => {
    const absolute = absoluteHttpUrl(value, baseUrl);
    if (absolute) urls.add(absolute);
  };
  for (const image of Array.from(document.images)) {
    add(image.currentSrc);
    add(image.getAttribute('src'));
    add(image.getAttribute('data-src'));
    add(image.getAttribute('data-lazy-src'));
    add(image.getAttribute('data-original'));
    for (const candidate of (image.getAttribute('srcset') ?? '').split(',')) {
      add(candidate.trim().split(/\s+/)[0]);
    }
  }
  for (const source of Array.from(document.querySelectorAll('picture source'))) {
    for (const candidate of (source.getAttribute('srcset') ?? '').split(',')) {
      add(candidate.trim().split(/\s+/)[0]);
    }
  }
  return [...urls].slice(0, CAPTURE_LIMITS.maxAssets);
}

export function captureRenderedPage(
  document: Document,
  pageUrl = document.location.href,
): PageCaptureDraft {
  const clone = createCredentialScrubbedClone(document);
  const renderedDom = `<!doctype html>\n${clone.documentElement.outerHTML}`;
  const readable = new Readability(clone, {
    charThreshold: 0,
    keepClasses: false,
    maxElemsToParse: 50_000,
  }).parse();
  const originalUrl = new URL(pageUrl);
  originalUrl.username = '';
  originalUrl.password = '';
  originalUrl.hash = '';
  const canonical = absoluteHttpUrl(
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    document.baseURI,
  );
  const author =
    firstMeta(document, 'meta[name="author"]', 'meta[property="article:author"]') ??
    readable?.byline ??
    undefined;
  const siteName =
    firstMeta(document, 'meta[property="og:site_name"]') ?? readable?.siteName ?? undefined;
  const excerpt =
    firstMeta(document, 'meta[name="description"]', 'meta[property="og:description"]') ??
    readable?.excerpt ??
    undefined;
  const publishedAt =
    firstMeta(document, 'meta[property="article:published_time"]') ??
    readable?.publishedTime ??
    undefined;
  const language = document.documentElement.lang || readable?.lang || undefined;
  return {
    originalUrl: originalUrl.href,
    canonicalUrl: canonical ?? originalUrl.href,
    metadata: {
      title:
        (firstMeta(document, 'meta[property="og:title"]', 'meta[name="twitter:title"]') ??
          readable?.title?.trim() ??
          document.title.trim()) ||
        originalUrl.hostname,
      ...(author ? { author } : {}),
      ...(siteName ? { siteName } : {}),
      ...(excerpt ? { excerpt } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(language ? { language } : {}),
    },
    renderedDom,
    extractedReaderHtml: readable?.content ?? '',
    assetUrls: collectAssetUrls(document, pageUrl),
    warnings: readable ? [] : ['producer-extraction-failed'],
    diagnostics: { elementCount: clone.querySelectorAll('*').length },
  };
}
