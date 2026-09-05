// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public policy documents', () => {
  for (const [file, title] of [
    ['privacy.html', 'Privacy Policy'],
    ['terms.html', 'Terms of Service'],
  ]) {
    it(`${file} is self-contained, accessible, and independent of app authorization`, () => {
      const html = readFileSync(resolve('apps/web', file), 'utf8');
      const document = new DOMParser().parseFromString(html, 'text/html');
      expect(document.documentElement.lang).toBe('en');
      expect(document.querySelector('title')?.textContent).toBe(`${title} · PostKeeper`);
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(document.querySelector('h1')?.textContent).toBe(title);
      expect(document.querySelector('main#content')).not.toBeNull();
      expect(document.querySelector('script, iframe, form, img')).toBeNull();
      expect(
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content'),
      ).toContain("connect-src 'none'");
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        `https://keep.fishese.cc/${file}`,
      );
      expect(
        document.querySelector('a[href="https://github.com/fishese/postkeeper/issues"]'),
      ).not.toBeNull();
      expect(document.body.textContent).toContain('public');
      expect(document.body.textContent).not.toMatch(/TODO|\[your|placeholder/iu);
      for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
        expect(document.getElementById(anchor.getAttribute('href')!.slice(1))).not.toBeNull();
      }
    });
  }
});

describe('extension installation document', () => {
  it('is a script-free public page with versioned downloads and wrapper guidance', () => {
    const html = readFileSync(resolve('apps/web', 'extensions.html'), 'utf8');
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('title')?.textContent).toBe('Browser extension · PostKeeper');
    expect(document.querySelector('h1')?.textContent).toBe('Install the browser extension');
    expect(document.querySelector('main#content')).not.toBeNull();
    expect(document.querySelector('script, iframe, form, img')).toBeNull();
    expect(
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
    ).toContain("connect-src 'none'");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://keep.fishese.cc/extensions.html',
    );
    expect(document.body.textContent).toContain('keep.fishese.cc');
    expect(document.body.textContent).toContain('cannot send directly into the APK');
    expect(
      document.querySelector('a[href$="/extension-v0.1.2/postkeeper-chromium-0.1.2.zip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('a[href$="/extension-v0.1.2/postkeeper-firefox-0.1.2.zip"]'),
    ).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/TODO|\[your|placeholder/iu);
  });
});
