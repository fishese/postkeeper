// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { captureRenderedPage } from './capture-page';

const url = 'https://www.threads.com/@writer/post/main';
function post(name: string, id: string, body: string, boundary = true): string {
  return `<div ${boundary ? 'data-pressable-container="true"' : ''}>
    <div><img width="36" src="https://cdn.test/avatar.jpg" alt="${name}'s profile picture">
    <a href="/@${name}">${name}</a><a href="/@${name}/post/${id}"><time datetime="2026-09-07">7 Sep</time></a></div>
    <div lang="zh-Hant"><span dir="auto"><span>${body}</span><div role="button">Translate</div><div>1/2</div></span></div>
    <div role="button">Like 300</div></div>`;
}
function capture(html: string, source = url) {
  return captureRenderedPage(new DOMParser().parseFromString(html, 'text/html'), source);
}

describe('Threads conversation capture', () => {
  it('preserves short CJK posts, line breaks, links and loaded replies without site chrome', () => {
    const draft = capture(`<nav>Home</nav>${post('writer', 'main', '第一行\n第二行')}
      ${post('reader', 'reply', '短回覆 <a href="https://example.test/menu">菜單</a>')}
      <div data-pagelet="related_threads">${post('other', 'unrelated', 'Recommendation')}</div>
      <footer>Log in Get app</footer>`);
    const doc = new DOMParser().parseFromString(draft.extractedReaderHtml, 'text/html');
    expect(doc.querySelectorAll('article > section')).toHaveLength(2);
    expect(draft.extractedReaderHtml).toContain('第一行<br>第二行');
    expect(draft.extractedReaderHtml).toContain('短回覆');
    expect(draft.extractedReaderHtml).toContain('https://example.test/menu');
    expect(draft.extractedReaderHtml).not.toMatch(
      /Translate|Like 300|1\/2|Recommendation|Log in|avatar/,
    );
    expect(draft.assetUrls).toEqual([]);
    expect(draft.warnings).toEqual([]);
  });

  it('captures public post cards and prefers post photos over avatars and preview metadata', () => {
    const draft = capture(
      `<html lang="en"><head><meta property="og:image" content="https://cdn.test/preview.jpg"></head><body>
      ${post('writer', 'main', 'Caption', false).replace('<div role="button">Like', '<img src="https://cdn.test/photo.jpg" alt="Food"><div role="button">Like')}
      ${post('reader', 'reply', 'Public reply', false)}</body></html>`,
      'https://threads.net/@writer/post/main',
    );
    expect(draft.extractedReaderHtml).toContain('Public reply');
    expect(draft.assetUrls).toEqual(['https://cdn.test/photo.jpg']);
  });

  it('deduplicates permalinks and does not capture hidden replies or unsent compose text', () => {
    const draft = capture(`${post('writer', 'main', 'Visible post')}
      ${post('writer', 'main', 'Duplicated card')}
      <div hidden>${post('reader', 'hidden', 'Hidden reply')}</div>
      <div contenteditable="true">Unsent private reply</div>`);
    expect(draft.extractedReaderHtml).not.toMatch(/Duplicated card|Hidden reply|Unsent private/);
    expect(draft.renderedDom).not.toContain('Unsent private');
  });

  it('falls back safely when Threads markup no longer identifies the target post', () => {
    const draft = capture('<article><p>Ordinary readable fallback text.</p></article>');
    expect(draft.extractedReaderHtml).toContain('Ordinary readable');
  });
});
