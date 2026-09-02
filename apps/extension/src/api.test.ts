import { describe, expect, it } from 'vitest';
import { originPattern } from './api';

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
