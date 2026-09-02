// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sha256Hex, type CapturePackage } from '@postkeeper/capture-format';
import { extractReaderFromDom, processCapturePackage } from './index';

const imageBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
);

async function fixture(
  name: string,
  renderedDom: string,
  options: { withAsset?: boolean } = {},
): Promise<CapturePackage> {
  const url = `https://fixtures.postkeeper.local/${name}.html`;
  return {
    formatVersion: 1,
    captureId: `fixture-${name}`,
    capturedAt: '2026-08-24T00:00:00.000Z',
    captureMethod: 'fixture',
    sourceBrowser: 'Vitest jsdom',
    originalUrl: url,
    canonicalUrl: url,
    metadata: { title: `${name} fixture` },
    renderedDom,
    extractedReaderHtml: '',
    assets: options.withAsset
      ? [
          {
            assetId: 'blue-image',
            sourceUrl: 'https://fixtures.postkeeper.local/assets/blue.svg',
            mediaType: 'image/svg+xml',
            byteLength: imageBytes.byteLength,
            sha256: await sha256Hex(imageBytes),
            bytes: imageBytes,
          },
        ]
      : [],
    warnings: [],
  };
}

describe('capture processing', () => {
  it.each([
    [
      'public',
      '<title>Public</title><article><h1>Public fixture</h1><p>Readable public fixture text.</p><img src="assets/blue.svg"></article>',
    ],
    [
      'authenticated',
      '<script>location.href="/login"</script><article><h1>Authenticated fixture</h1><p>Private fixture text.</p><img src="assets/blue.svg"></article>',
    ],
    [
      'lazy',
      '<article><h1>Lazy fixture</h1><p>Lazy image content.</p><img data-src="assets/blue.svg"><script>run()</script></article>',
    ],
  ])('imports the %s fixture deterministically', async (name, html) => {
    const capture = await fixture(name, html, { withAsset: true });
    const first = await processCapturePackage(capture);
    const second = await processCapturePackage(capture);
    expect(first.status).toBe('complete');
    expect(first.readerHtml).toBe(second.readerHtml);
    expect(first.readerHtml).toContain('pk-asset:blue-image');
    expect(first.readerHtml).not.toMatch(/<script|data-src=/i);
  });

  it('uses Readability and neutralizes hostile markup and missing assets', async () => {
    const hostile = await fixture(
      'hostile',
      '<article onclick="window.bad=1"><h1>Hostile fixture</h1><p>Unsafe content is present for sanitizer tests.</p><form action="https://bad.test"><input><button>Send</button></form><img src="missing.png" onerror="window.bad=2"><script>window.bad=3</script><iframe src="https://bad.test"></iframe></article>',
    );
    expect(extractReaderFromDom(hostile.renderedDom, hostile.originalUrl)?.html).toContain(
      'Hostile fixture',
    );
    const processed = await processCapturePackage(hostile);
    expect(processed.status).toBe('partial');
    expect(processed.warnings).toEqual([
      'missing-asset:https://fixtures.postkeeper.local/missing.png',
    ]);
    expect(processed.readerHtml).not.toMatch(/script|onerror|onclick|iframe|form|input|button/i);
    expect(processed.readerHtml).not.toContain('https://bad.test');
  });

  it('returns a failed capture state when no readable content exists', async () => {
    const empty = await fixture(
      'empty',
      '<html><head><title>Empty</title></head><body></body></html>',
    );
    const processed = await processCapturePackage(empty);
    expect(processed.status).toBe('failed');
    expect(processed.warnings).toContain('extraction-failed');
  });
});
