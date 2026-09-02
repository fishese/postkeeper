import { describe, expect, it } from 'vitest';
import { normalizePwaUrl, originPattern } from './api';
import { assertAllowedSender, constantTimeEqual } from './security';

describe('extension origin and capability security', () => {
  it('allows exact configured origins and paths only', () => {
    expect(() =>
      assertAllowedSender(
        'https://reader.example/app/#pkTransfer=x',
        'https://reader.example/app/',
      ),
    ).not.toThrow();
    expect(() =>
      assertAllowedSender('https://evil.example/app/', 'https://reader.example/app/'),
    ).toThrow(/configured/);
    expect(() =>
      assertAllowedSender('https://reader.example/other/', 'https://reader.example/app/'),
    ).toThrow(/configured/);
  });

  it('requires HTTPS except for local development and strips URL credentials', () => {
    expect(normalizePwaUrl('https://user:pass@reader.example/app/?x=1#x')).toBe(
      'https://reader.example/app/',
    );
    expect(normalizePwaUrl('http://127.0.0.1:4173/')).toBe('http://127.0.0.1:4173/');
    expect(() => normalizePwaUrl('http://reader.example/')).toThrow(/HTTPS/);
    expect(originPattern('https://reader.example/app/')).toBe('https://reader.example/*');
  });

  it('compares transfer capabilities without an early length exit', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});
