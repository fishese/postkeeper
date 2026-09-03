import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSettings, originPattern } from './api';

describe('default PWA destination', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the published PostKeeper PWA when no destination has been saved', async () => {
    vi.stubGlobal('browser', { storage: { local: { get: vi.fn().mockResolvedValue({}) } } });
    await expect(getSettings()).resolves.toEqual({ pwaUrl: 'https://keep.fishese.cc/' });
  });

  it('preserves an existing custom destination instead of migrating it silently', async () => {
    vi.stubGlobal('browser', {
      storage: {
        local: { get: vi.fn().mockResolvedValue({ pwaUrl: 'https://example.com/library/' }) },
      },
    });
    await expect(getSettings()).resolves.toEqual({ pwaUrl: 'https://example.com/library/' });
  });
});

describe('originPattern', () => {
  it.each([
    ['https://example.com/library', 'https://example.com/*'],
    ['https://example.com:8443/library', 'https://example.com/*'],
    ['http://127.0.0.1:4173/', 'http://127.0.0.1/*'],
    ['http://[::1]:4173/', 'http://[::1]/*'],
  ])('creates a port-independent WebExtension match pattern for %s', (value, expected) => {
    expect(originPattern(value)).toBe(expected);
  });
});
