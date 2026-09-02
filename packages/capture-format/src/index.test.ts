import { describe, expect, it } from 'vitest';
import {
  ChunkedCaptureReceiver,
  decodeCapturePackage,
  encodeCapturePackage,
  sha256Hex,
  validateCapturePackage,
  verifyCaptureAssetHashes,
  type CapturePackage,
} from './index';

async function capture(): Promise<CapturePackage> {
  const bytes = new TextEncoder().encode('image');
  return {
    formatVersion: 1,
    captureId: 'capture-1',
    capturedAt: '2026-08-24T00:00:00.000Z',
    captureMethod: 'fixture',
    sourceBrowser: 'Vitest',
    originalUrl: 'https://example.test/article#fragment',
    canonicalUrl: 'https://example.test/article',
    metadata: { title: 'Fixture' },
    renderedDom: '<article>Fixture</article>',
    extractedReaderHtml: '',
    assets: [
      {
        assetId: 'image-1',
        sourceUrl: 'https://example.test/image.png',
        mediaType: 'image/png',
        byteLength: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        bytes,
      },
    ],
    warnings: [],
  };
}

describe('capture format', () => {
  it('normalizes valid packages and verifies producer hashes independently', async () => {
    const valid = validateCapturePackage(await capture());
    expect(valid.originalUrl).toBe('https://example.test/article');
    await expect(verifyCaptureAssetHashes(valid)).resolves.toBeUndefined();
  });

  it('rejects paths, unsupported media, length mismatches, and bad hashes', async () => {
    const base = await capture();
    expect(() => validateCapturePackage({ ...base, captureId: '../capture' })).toThrow(/captureId/);
    expect(() =>
      validateCapturePackage({ ...base, assets: [{ ...base.assets[0], mediaType: 'text/html' }] }),
    ).toThrow(/media type/);
    expect(() =>
      validateCapturePackage({ ...base, assets: [{ ...base.assets[0], byteLength: 99 }] }),
    ).toThrow(/byte length/);
    const badHash = validateCapturePackage({
      ...base,
      assets: [{ ...base.assets[0], sha256: '0'.repeat(64) }],
    });
    await expect(verifyCaptureAssetHashes(badHash)).rejects.toThrow(/hash mismatch/);
  });

  it('assembles ordered, bounded, hash-verified chunks', async () => {
    const receiver = new ChunkedCaptureReceiver(8);
    const first = new TextEncoder().encode('abc');
    const second = new TextEncoder().encode('def');
    await expect(
      receiver.receive({
        transferId: 'transfer-1',
        index: 0,
        totalChunks: 2,
        sha256: await sha256Hex(first),
        bytes: first,
      }),
    ).resolves.toEqual({ complete: false, nextIndex: 1 });
    const result = await receiver.receive({
      transferId: 'transfer-1',
      index: 1,
      totalChunks: 2,
      sha256: await sha256Hex(second),
      bytes: second,
    });
    expect(result.complete && new TextDecoder().decode(result.bytes)).toBe('abcdef');
    await expect(
      receiver.receive({
        transferId: 'transfer-1',
        index: 2,
        totalChunks: 2,
        sha256: await sha256Hex(second),
        bytes: second,
      }),
    ).rejects.toThrow(/already complete/);
  });

  it('round-trips a compact binary envelope without base64 expansion', async () => {
    const original = await capture();
    const encoded = encodeCapturePackage(original);
    const decoded = decodeCapturePackage(encoded);
    expect(decoded.metadata).toEqual(original.metadata);
    expect(decoded.assets[0]?.bytes).toEqual(original.assets[0]?.bytes);
    expect(() => decodeCapturePackage(encoded.slice(0, -1))).toThrow(/Truncated/);
  });
});
