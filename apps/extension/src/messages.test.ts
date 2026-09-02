import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from './messages';

describe('extension message encoding', () => {
  it('round trips a chunk larger than the function argument limit', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 251);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });
});
