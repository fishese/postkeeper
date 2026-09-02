import { describe, expect, it } from 'vitest';
import { blobId } from '@postkeeper/domain';
import { createReaderDocument } from './readerDocument';

const id = blobId('a'.repeat(64));

describe('isolated reader image documents', () => {
  it('embeds local images without blob URLs or a privileged reader origin', () => {
    const document = createReaderDocument({
      html: `<img alt="fixture" src="pk-blob:${id}">`,
      assets: [{ id, mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
    });
    expect(document).toContain('src="data:image/png;base64,AQID"');
    expect(document).not.toContain('blob:');
    expect(document).toContain('img-src data:');
    expect(document).toContain("script-src 'none'");
    expect(document).toContain("connect-src 'none'");
  });

  it('round-trips images larger than one base64 conversion chunk', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    const document = createReaderDocument({
      html: `<img src="pk-blob:${id}">`,
      assets: [{ id, mediaType: 'image/webp', bytes }],
    });
    const encoded = /data:image\/webp;base64,([^" ]+)/u.exec(document)?.[1];
    expect(encoded).toBeDefined();
    expect(Uint8Array.from(atob(encoded!), (character) => character.charCodeAt(0))).toEqual(bytes);
  });

  it('does not interpolate unsupported or malicious MIME values into the document', () => {
    for (const mediaType of ['text/html', 'image/png" onerror="alert(1)']) {
      const document = createReaderDocument({
        html: `<img src="pk-blob:${id}">`,
        assets: [{ id, mediaType, bytes: new Uint8Array([1]) }],
      });
      expect(document).not.toContain(`data:${mediaType}`);
      expect(document).not.toContain('onerror');
    }
  });
});
