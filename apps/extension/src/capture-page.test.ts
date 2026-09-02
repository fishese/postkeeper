// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { captureRenderedPage, createCredentialScrubbedClone } from './capture-page';

function fixture(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extension page capture', () => {
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
    expect(capture.assetUrls).toEqual([
      'https://example.test/one.png',
      'https://example.test/two.png',
      'https://example.test/small.png',
      'https://example.test/large.png',
    ]);
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
