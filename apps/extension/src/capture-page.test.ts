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

  it('uses the page preview image when extracted article text omits the primary media', () => {
    const doc = fixture(
      '<head><meta property="og:image" content="https://preview.test/post.jpg"></head><body><article><h1>Photo story</h1><p>The readable caption remains available offline.</p></article></body>',
    );
    const draft = captureRenderedPage(doc, 'https://example.test/photo-story');
    expect(draft.extractedReaderHtml).toContain('src="https://preview.test/post.jpg"');
    expect(draft.assetUrls[0]).toBe('https://preview.test/post.jpg');
  });

  it('prefers a specific media post over a broad page container with an advertisement', () => {
    const doc = fixture(
      '<main><shreddit-post><h1>Cat post</h1><p>A short post caption with its photo.</p><img src="https://preview.test/cat.jpg"></shreddit-post><aside><p>Sponsored recommendation</p><img src="https://ads.test/ad.jpg"></aside></main><section><p>Continue reading in the app.</p></section>',
    );
    const draft = captureRenderedPage(doc, 'https://e.invalided.example/post');
    expect(draft.extractedReaderHtml).toContain('Cat post');
    expect(draft.assetUrls[0]).toBe('https://preview.test/cat.jpg');
    expect(draft.assetUrls).not.toContain('https://ads.test/ad.jpg');
  });

  it('keeps the declared primary image and only loaded, expanded Reddit comments', () => {
    const doc = fixture(
      '<main><shreddit-post id="t3_post" permalink="/r/aww/comments/post/title/" post-type="image" post-title="Two sleeping dogs" content-href="https://i.redd.it/dogs.jpeg"><img src="https://redditstatic.com/community.png"><img src="https://preview.redd.it/blurred.jpeg"><img id="post-image" alt="Two sleeping dogs" src="https://preview.redd.it/dogs.jpeg"></shreddit-post><section><shreddit-comment author="visible-user" created="2026-09-08T18:49:53.912000+0000" depth="0" permalink="/r/aww/comments/post/comment/one/"><details><div slot="comment"><p>Visible first-load comment.</p></div></details></shreddit-comment><shreddit-comment author="nested-user" depth="1" permalink="/r/aww/comments/post/comment/two/"><details><div slot="comment"><p>Loaded reply.</p></div></details></shreddit-comment><shreddit-comment author="collapsed-user" collapsed depth="1"><details><div slot="comment"><p>Collapsed reply.</p></div></details></shreddit-comment><shreddit-comment author="hidden-user" aria-hidden="true"><details><div slot="comment"><p>Hidden comment.</p></div></details></shreddit-comment></section><aside><img src="https://ads.test/ad.jpg"></aside></main>',
    );
    const draft = captureRenderedPage(doc, 'https://www.reddit.com/r/aww/comments/post/title/');
    expect(draft.extractedReaderHtml).toContain('Two sleeping dogs');
    expect(draft.extractedReaderHtml).toContain('https://i.redd.it/dogs.jpeg');
    expect(draft.extractedReaderHtml).not.toMatch(/community|blurred|ads\.test/u);
    expect(draft.extractedReaderHtml).toContain('Visible first-load comment.');
    expect(draft.extractedReaderHtml).toContain('Loaded reply.');
    expect(draft.extractedReaderHtml).toContain('data-comment-depth="1"');
    expect(draft.extractedReaderHtml).toContain(
      'https://www.reddit.com/r/aww/comments/post/comment/one/',
    );
    expect(draft.extractedReaderHtml).not.toMatch(/Collapsed reply|Hidden comment/u);
    expect(draft.assetUrls).toEqual(['https://i.redd.it/dogs.jpeg']);
    expect(draft.warnings).toContain('producer-primary-media');
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
