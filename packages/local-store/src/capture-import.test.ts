// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, type CapturePackage } from '@postkeeper/capture-format';
import { openLibrary } from './index';

function dbName(label: string): string {
  return `postkeeper-capture-${label}-${Math.random().toString(16).slice(2)}`;
}

async function capture(
  options: {
    canonicalUrl?: string;
    missingAsset?: boolean;
    duplicateAsset?: boolean;
  } = {},
): Promise<CapturePackage> {
  const bytes = new TextEncoder().encode('same-image-bytes');
  const hash = await sha256Hex(bytes);
  const firstSource = 'https://fixtures.postkeeper.local/assets/one.png';
  const secondSource = 'https://fixtures.postkeeper.local/assets/two.png';
  const assets: CapturePackage['assets'] = [
    {
      assetId: 'image-one',
      sourceUrl: firstSource,
      mediaType: 'image/png',
      byteLength: bytes.byteLength,
      sha256: hash,
      bytes,
    },
  ];
  if (options.duplicateAsset) {
    assets.push({ ...assets[0]!, assetId: 'image-two', sourceUrl: secondSource });
  }
  const extraImage = options.missingAsset
    ? '<img alt="missing" src="https://fixtures.postkeeper.local/assets/missing.png">'
    : options.duplicateAsset
      ? `<img alt="two" src="${secondSource}">`
      : '';
  return {
    formatVersion: 1,
    captureId: 'capture-local-store',
    capturedAt: '2026-08-24T00:00:00.000Z',
    captureMethod: 'fixture',
    sourceBrowser: 'Vitest jsdom',
    originalUrl: 'https://fixtures.postkeeper.local/article.html',
    canonicalUrl: options.canonicalUrl ?? 'https://fixtures.postkeeper.local/article.html',
    metadata: {
      title: 'Imported capture',
      author: 'Fixture Author',
      siteName: 'PostKeeper Fixtures',
      excerpt: 'Imported securely.',
      language: 'en',
    },
    renderedDom: '<article><h1>Raw capture</h1></article>',
    extractedReaderHtml: `<article><h1>Imported capture</h1><p>Secure searchable phrase.</p><img alt="one" src="${firstSource}">${extraImage}</article>`,
    assets,
    warnings: [],
  };
}

describe('capture package import', () => {
  it('stores raw DOM, rewrites local assets, and reports missing assets', async () => {
    const library = await openLibrary({ name: dbName('partial') });
    const article = await library.importCapturePackage(await capture({ missingAsset: true }));
    expect(article.captureStatus).toBe('partial');
    expect(article.warnings).toEqual([
      'missing-asset:https://fixtures.postkeeper.local/assets/missing.png',
    ]);
    const reader = await library.getReader(article.id);
    expect(reader.snapshot.rawDomBlobId).not.toBeNull();
    expect(reader.html).toMatch(/pk-blob:[a-f0-9]{64}/);
    expect(reader.html).not.toMatch(/https:\/\/fixtures\.postkeeper\.local\/assets\//);
    expect(reader.assets).toHaveLength(1);
    expect((await library.search('secure searchable')).map((item) => item.id)).toEqual([
      article.id,
    ]);
    await library.close();
  });

  it('deduplicates blobs and creates immutable snapshots on recapture', async () => {
    const library = await openLibrary({ name: dbName('recapture') });
    const first = await library.importCapturePackage(await capture({ duplicateAsset: true }));
    await library.updateArticle(first.id, { isFavorite: true });
    const recapture = await capture({ duplicateAsset: true });
    recapture.captureId = 'capture-local-store-2';
    recapture.capturedAt = '2026-08-24T01:00:00.000Z';
    const second = await library.importCapturePackage(recapture);
    expect(second.id).toBe(first.id);
    expect(second.isFavorite).toBe(true);
    expect(await library.getStats()).toEqual({
      articles: 1,
      snapshots: 2,
      blobs: 3,
      categories: 0,
    });
    const snapshots = await library.listSnapshots(first.id);
    expect(snapshots).toHaveLength(2);
    expect(new Set(snapshots.map((snapshot) => snapshot.id)).size).toBe(2);
    expect(snapshots.every((snapshot) => snapshot.rawDomBlobId)).toBe(true);
    await library.close();
  });

  it('rejects an invalid package before mutating the active library', async () => {
    const library = await openLibrary({ name: dbName('atomic') });
    const invalid = await capture();
    invalid.assets[0]!.sha256 = '0'.repeat(64);
    await expect(library.importCapturePackage(invalid)).rejects.toThrow(/hash mismatch/);
    expect(await library.getStats()).toEqual({
      articles: 0,
      snapshots: 0,
      blobs: 0,
      categories: 0,
    });
    await library.close();
  });
});
