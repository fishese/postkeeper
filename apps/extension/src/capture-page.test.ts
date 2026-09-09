// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { captureRenderedPage, createCredentialScrubbedClone } from './capture-page';

function fixture(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extension page capture', () => {
  it('does not save just an app promotion when substantial article text is already loaded', () => {
    const body =
      'This is the loaded book review, with ordinary paragraphs about its author and story. '.repeat(
        12,
      );
    const doc = fixture(
      `<title>A book review</title><main class="comment"><article class="comment"><p>${body}</p></article></main><section><p>Continue reading in the app - it is better.</p></section>`,
    );
    const result = captureRenderedPage(doc, 'https://example.test/review');
    expect(result.extractedReaderHtml).toContain('loaded book review');
    expect(result.extractedReaderHtml).not.toBe(
      '<p>Continue reading in the app - it is better.</p>',
    );
  });
  it('keeps the selected responsive image in the reader instead of a placeholder', () => {
    const doc = fixture(
      '<article><h1>Photo post</h1><p>A visible photo.</p><picture><source srcset="https://cdn.test/photo.webp 2x"><img src="https://cdn.test/placeholder.png"></picture></article>',
    );
    Object.defineProperty(doc.images[0], 'currentSrc', { value: 'https://cdn.test/photo.webp' });
    const draft = captureRenderedPage(doc, 'https://example.test/post');
    expect(draft.extractedReaderHtml).toContain('src="https://cdn.test/photo.webp"');
    expect(draft.assetUrls).toContain('https://cdn.test/photo.webp');
  });

  it('full-page fallback retains loaded content while stripping dialogs and credentials', () => {
    const doc = fixture(
      '<main><p>The actual loaded article.</p></main><aside><p>Additional loaded paragraph.</p></aside><dialog open>Continue reading in the app</dialog><div hidden>Hidden teaser</div><input value="private-entry"><script>secret()</script>',
    );
    const draft = captureRenderedPage(doc, 'https://example.test/post', 'page');
    expect(draft.extractedReaderHtml).toContain('actual loaded article');
    expect(draft.extractedReaderHtml).toContain('Additional loaded paragraph');
    expect(draft.extractedReaderHtml).not.toMatch(
      /Continue reading|Hidden teaser|private-entry|secret\(/,
    );
    expect(draft.warnings).toContain('producer-full-page-copy');
  });
  it('captures rendered metadata and lazy image candidates', () => {
    const document = fixture(`<!doctype html><html lang="en"><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Captured title">
      <meta name="author" content="Fixture Author">
      <link rel="canonical" href="https://example.test/canonical">
      </head><body><article><h1>Captured title</h1><p>Long enough readable fixture text.</p>
      <img src="/one.png" data-lazy-src="/two.png" srcset="/small.png 1x, /large.png 2x">
      </article></body></html>`);
    const capture = captureRenderedPage(document, 'https://example.test/article#section');
    expect(capture.originalUrl).toBe('https://example.test/article');
    expect(capture.canonicalUrl).toBe('https://example.test/canonical');
    expect(capture.metadata).toMatchObject({ title: 'Captured title', author: 'Fixture Author' });
    expect(capture.assetUrls).toEqual(['https://example.test/two.png']);
  });

  it('removes credentials, cookies, tokens, scripts, and form controls from raw DOM', () => {
    const document = fixture(`<!doctype html><html><head>
      <meta name="csrf-token" content="csrf-value">
      <script>document.cookie = "session=secret-cookie"</script>
      </head><body><article data-session-token="secret-token"><h1>Private page</h1>
      <p>Readable account content.</p><form><input type="password" value="password-value">
      <textarea>private form value</textarea><select><option selected>private option</option></select></form>
      </article></body></html>`);
    const clone = createCredentialScrubbedClone(document);
    const raw = clone.documentElement.outerHTML;
    expect(raw).not.toMatch(
      /secret-cookie|csrf-value|secret-token|password-value|private form value|private option/,
    );
    expect(raw).not.toMatch(/<script|<input|<textarea|<select/i);
    expect(raw).toContain('Readable account content.');
  });
});
