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

function semanticCandidateScore(element: Element): number {
  const textLength = element.textContent?.trim().length ?? 0;
  const imageCount = Math.min(element.querySelectorAll('img, picture').length, 5);
  const isSpecific = element.matches(
    'article, [itemprop="articleBody"], [data-testid="post-container"], shreddit-post',
  );
  const isBroad = element.matches('main, [role="main"]');
  return (
    Math.min(textLength, 20_000) +
    imageCount * 800 +
    (isSpecific ? 12_000 : 0) -
    (isBroad ? 8_000 : 0)
  );
}

function redditImagePost(document: Document, pageUrl: string): string | null {
  const url = new URL(pageUrl);
  if (!/(^|\.)reddit\.com$/iu.test(url.hostname)) return null;
  const posts = Array.from(document.querySelectorAll('shreddit-post'));
  const post =
    posts.find((candidate) => candidate.getAttribute('permalink') === url.pathname) ?? posts[0];
  if (!post || post.getAttribute('post-type') !== 'image') return null;
  const source =
    absoluteHttpUrl(post.getAttribute('content-href'), pageUrl) ??
    absoluteHttpUrl(post.querySelector<HTMLImageElement>('#post-image')?.currentSrc, pageUrl) ??
    absoluteHttpUrl(post.querySelector<HTMLImageElement>('#post-image')?.src, pageUrl);
  if (!source) return null;

  const article = document.createElement('article');
  const title = post.getAttribute('post-title')?.trim();
  if (title) {
    const heading = document.createElement('h1');
    heading.textContent = title;
    article.append(heading);
  }
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.src = source;
  image.alt = post.querySelector<HTMLImageElement>('#post-image')?.alt || title || '';
  figure.append(image);
  article.append(figure);

  const loadedComments = Array.from(document.querySelectorAll('shreddit-comment')).filter(
    (comment) =>
      comment.getAttribute('aria-hidden') !== 'true' &&
      !comment.hasAttribute('collapsed') &&
      !!comment
        .querySelector<HTMLElement>(':scope > details [slot="comment"]')
        ?.textContent?.trim(),
  );
  if (loadedComments.length > 0) {
    const section = document.createElement('section');
    const commentsHeading = document.createElement('h2');
    commentsHeading.textContent = 'Comments';
    section.append(commentsHeading);
    for (const comment of loadedComments.slice(0, 100)) {
      const body = comment.querySelector<HTMLElement>(':scope > details [slot="comment"]');
      if (!body) continue;
      const entry = document.createElement('article');
      const depth = Number(comment.getAttribute('depth') ?? 0);
      if (Number.isFinite(depth) && depth > 0)
        entry.setAttribute('data-comment-depth', String(depth));
      const header = document.createElement('p');
      const author = comment.getAttribute('author')?.trim();
      const created = comment.getAttribute('created')?.trim();
      const permalink = absoluteHttpUrl(comment.getAttribute('permalink'), pageUrl);
      const authorNode = document.createElement('strong');
      authorNode.textContent = author ? `u/${author}` : 'Reddit comment';
      if (permalink) {
        const link = document.createElement('a');
        link.href = permalink;
        link.append(authorNode);
        header.append(link);
      } else {
        header.append(authorNode);
      }
      if (created) {
        const time = document.createElement('time');
        time.dateTime = created;
        time.textContent = ` · ${created}`;
        header.append(time);
      }
      entry.append(header, body.cloneNode(true));
      section.append(entry);
    }
    article.append(section);
  }
  return article.outerHTML;
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
  const redditReaderHtml = redditImagePost(document, pageUrl);
  // Preserve substantial semantic article content when a short app-promotion wins Readability.
  const candidates = Array.from(
    visible.querySelectorAll(
      'article, [itemprop="articleBody"], [data-testid="post-container"], shreddit-post, main, [role="main"]',
    ),
  );
  const candidate = candidates.sort(
    (a, b) => semanticCandidateScore(b) - semanticCandidateScore(a),
  )[0];
  const length = readable?.textContent?.trim().length ?? 0;
  const candidateLength = candidate?.textContent?.trim().length ?? 0;
  const candidateHasMedia = !!candidate?.querySelector('img, picture');
  if (redditReaderHtml) {
    readerHtml = redditReaderHtml;
    warnings.splice(0, warnings.length, 'producer-primary-media');
  } else if (
    candidate &&
    length < 300 &&
    (candidateLength > Math.max(300, length * 2) ||
      (candidateHasMedia && candidateLength >= Math.max(40, Math.floor(length / 2))))
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
  const readerDocument = new DOMParser().parseFromString(readerHtml, 'text/html');
  if (collectAssetUrls(readerDocument, pageUrl).length === 0) {
    const socialImage = absoluteHttpUrl(
      firstMeta(
        document,
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[name="twitter:image"]',
      ),
      pageUrl,
    );
    if (socialImage) {
      const figure = readerDocument.createElement('figure');
      const image = readerDocument.createElement('img');
      image.src = socialImage;
      image.alt = '';
      figure.append(image);
      (readerDocument.querySelector('article, main, [role="main"]') ?? readerDocument.body).prepend(
        figure,
      );
      readerHtml = readerDocument.body.innerHTML;
    }
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
