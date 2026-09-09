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
  mode: 'reader' | 'page' = 'reader',
): PageCaptureDraft {
  const clone = createCredentialScrubbedClone(document);
  // currentSrc is runtime state and is lost by cloneNode (notably picture/srcset images).
  const liveImages = Array.from(document.images);
  Array.from(clone.images).forEach((image, index) => {
    const live = liveImages[index];
    const source =
      absoluteHttpUrl(live?.currentSrc, pageUrl) ??
      absoluteHttpUrl(
        image.getAttribute('data-src') ??
          image.getAttribute('data-lazy-src') ??
          image.getAttribute('data-original'),
        pageUrl,
      ) ??
      absoluteHttpUrl(image.getAttribute('src'), pageUrl);
    if (source) image.setAttribute('src', source);
    // The chosen rendered resource is sufficient; do not spend the image budget
    // downloading every responsive size, avatar, or unrelated recommendation.
    if (source) {
      for (const attribute of ['srcset', 'data-src', 'data-lazy-src', 'data-original'])
        image.removeAttribute(attribute);
    }
  });
  const renderedDom = `<!doctype html>\n${clone.documentElement.outerHTML}`;
  const visible = clone.cloneNode(true) as Document;
  for (const hidden of Array.from(
    visible.querySelectorAll(
      '[hidden], [aria-hidden="true"], dialog, [role="dialog"], nav, script, style',
    ),
  ))
    hidden.remove();
  const readable = new Readability(visible.cloneNode(true) as Document, {
    charThreshold: 0,
    keepClasses: false,
    maxElemsToParse: 50_000,
  }).parse();
  let readerHtml = readable?.content ?? '';
  const warnings: string[] = readable ? [] : ['producer-extraction-failed'];
  // Preserve substantial semantic article content when a short app-promotion wins Readability.
  const candidates = Array.from(
    visible.querySelectorAll('article, main, [role="main"], [itemprop="articleBody"]'),
  );
  const candidate = candidates.sort(
    (a, b) => (b.textContent?.trim().length ?? 0) - (a.textContent?.trim().length ?? 0),
  )[0];
  const length = readable?.textContent?.trim().length ?? 0;
  if (
    candidate &&
    length < 300 &&
    (candidate.textContent?.trim().length ?? 0) > Math.max(300, length * 2)
  ) {
    readerHtml = candidate.outerHTML;
    warnings.splice(0, warnings.length, 'producer-semantic-fallback');
  } else if (length < 100) {
    warnings.push('producer-short-content-check-original');
  }
  if (mode === 'page') {
    readerHtml = visible.body.innerHTML;
    warnings.splice(0, warnings.length, 'producer-full-page-copy');
  }
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
    extractedReaderHtml: readerHtml,
    assetUrls: collectAssetUrls(new DOMParser().parseFromString(readerHtml, 'text/html'), pageUrl),
    warnings,
    diagnostics: { elementCount: clone.querySelectorAll('*').length },
  };
}
