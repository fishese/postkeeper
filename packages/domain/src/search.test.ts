import { describe, expect, it } from 'vitest';
import { articleId, extractSearchText, tokenizeSearch } from './index';

describe('search helpers', () => {
  it('rejects empty branded identifiers', () => {
    expect(() => articleId('')).toThrow(/empty/);
    expect(() => articleId('   ')).toThrow(/empty/);
  });

  it('extracts searchable text from already-sanitized HTML', () => {
    expect(extractSearchText('<h1>Alpine Marmot</h1><p>Field notes.</p>')).toBe(
      'alpine marmot field notes.',
    );
  });

  it('tokenizes queries into lowercase terms', () => {
    expect(tokenizeSearch('Alpine Marmot!')).toEqual(['alpine', 'marmot']);
  });
});
