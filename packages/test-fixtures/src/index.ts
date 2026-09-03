export type TrustedAsset = {
  localId: string;
  mediaType: string;
  bytes: Uint8Array;
};

export type TrustedFixture = {
  key: string;
  title: string;
  author: string;
  siteName: string;
  originalUrl: string;
  canonicalUrl: string;
  excerpt: string;
  language: string;
  readerHtml: string;
  assets: TrustedAsset[];
};

const FIXTURE_IMAGE = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="160" height="90" fill="#457b9d"/><text x="20" y="50" fill="white" font-family="sans-serif">Fixture image</text></svg>',
);

const fixtureImage: TrustedAsset = {
  localId: 'fixture-image',
  mediaType: 'image/svg+xml',
  bytes: FIXTURE_IMAGE,
};

export const PUBLIC_FIXTURE: TrustedFixture = {
  key: 'public-article',
  title: 'A public fixture article',
  author: 'Fixture Author',
  siteName: 'PostKeeper Fixtures',
  originalUrl: 'https://fixtures.postkeeper.local/public-article',
  canonicalUrl: 'https://fixtures.postkeeper.local/public-article',
  excerpt: 'This local page represents readable public content.',
  language: 'en',
  readerHtml: `<article>
  <h1>A public fixture article</h1>
  <p>This local page represents readable public content.</p>
  <p>Searchable phrase: alpine marmot field notes.</p>
  <img alt="fixture" src="pk-blob:fixture-image" />
</article>`,
  assets: [fixtureImage],
};

export const LONG_PRINTABLE_FIXTURE: TrustedFixture = {
  key: 'long-printable',
  title: 'A long printable fixture',
  author: 'Fixture Author',
  siteName: 'PostKeeper Fixtures',
  originalUrl: 'https://fixtures.postkeeper.local/long-printable',
  canonicalUrl: 'https://fixtures.postkeeper.local/long-printable',
  excerpt: 'It contains headings, links, and a local image for print validation.',
  language: 'en',
  readerHtml: `<article>
  <h1>A long printable fixture</h1>
  <p>It contains headings, links, and a local image for print validation.</p>
  <img alt="print fixture" src="pk-blob:fixture-image" />
  <h2>Section one</h2>
  <p>One paragraph about river stones.</p>
  ${Array.from({ length: 12 }, (_, i) => `<h2>Field section ${i + 1}</h2>${Array.from({ length: 4 }, () => '<p>River stones record the changing seasons. We walked beside the water and recorded the plants, birds, and weather. These printable field notes provide a long paragraph to verify natural page breaks, readable line lengths, and the preservation of saved content across multiple sheets.</p>').join('')}`).join('')}
  <h2>Final section</h2>
  <p>End of the long printable fixture.</p>
  <p><a href="https://example.com">An external reference</a></p>
</article>`,
  assets: [fixtureImage],
};

export const TRUSTED_FIXTURES = [PUBLIC_FIXTURE, LONG_PRINTABLE_FIXTURE];

export type DevelopmentCaptureFixture = 'public' | 'authenticated' | 'lazy' | 'hostile';

const CAPTURE_DOCUMENTS: Record<DevelopmentCaptureFixture, string> = {
  public:
    '<title>Public fixture article</title><article><h1>A public fixture article</h1><p>This local page represents readable public content.</p><img alt="fixture" src="assets/blue.svg"></article>',
  authenticated:
    '<title>Authenticated fixture</title><script>if (!document.cookie.includes("postkeeper-fixture-auth=1")) location.href="sign-in.html"</script><article><h1>Authenticated fixture article</h1><p>This fixture is visible only after the harmless test cookie is present.</p><img alt="authenticated asset" src="assets/blue.svg"></article>',
  lazy: '<title>Lazy image fixture</title><article><h1>Lazy image fixture</h1><p>Lazy image content.</p><img alt="lazy fixture" data-src="assets/blue.svg" loading="lazy"><script>for (const image of document.querySelectorAll("img[data-src]")) image.src=image.dataset.src</script></article>',
  hostile:
    '<title>Hostile fixture</title><article onclick="window.__hostileHandlerRan=true"><h1>Hostile fixture</h1><form action="https://example.invalid"><input name="secret"><button>Submit</button></form><img src="missing.png" onerror="window.__hostileImageHandlerRan=true"><script>window.__hostileScriptRan=true</script><iframe src="https://example.invalid"></iframe><p>Unsafe content is present for sanitizer tests.</p></article>',
};

export async function createDevelopmentCaptureFixture(
  key: DevelopmentCaptureFixture,
): Promise<CapturePackage> {
  const originalUrl = `https://fixtures.postkeeper.local/${key}.html`;
  const assets: CapturePackage['assets'] = [];
  if (key !== 'hostile') {
    assets.push({
      assetId: 'fixture-image',
      sourceUrl: 'https://fixtures.postkeeper.local/assets/blue.svg',
      mediaType: 'image/svg+xml',
      byteLength: FIXTURE_IMAGE.byteLength,
      sha256: await sha256Hex(FIXTURE_IMAGE),
      bytes: FIXTURE_IMAGE,
    });
  }
  return {
    formatVersion: 1,
    captureId: `development-${key}`,
    capturedAt: '2026-08-24T00:00:00.000Z',
    captureMethod: 'development-fixture',
    sourceBrowser: 'PostKeeper development fixture',
    originalUrl,
    canonicalUrl: originalUrl,
    metadata: {
      title:
        key === 'public'
          ? 'A public fixture article'
          : key === 'authenticated'
            ? 'Authenticated fixture article'
            : key === 'lazy'
              ? 'Lazy image fixture'
              : 'Hostile fixture',
      author: 'Fixture Author',
      siteName: 'PostKeeper Fixtures',
      language: 'en',
    },
    renderedDom: CAPTURE_DOCUMENTS[key],
    extractedReaderHtml: '',
    assets,
    warnings: [],
  };
}
import { sha256Hex, type CapturePackage } from '@postkeeper/capture-format';
