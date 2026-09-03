// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { sanitizeStoredReaderHtml } from '@postkeeper/capture-processing';
import { originalHttpUrl } from './originalUrl';

it('strips active content, remote resources, navigation targets, and clobbering names from stored HTML', () => {
  const html = sanitizeStoredReaderHtml(
    `<h2 id="print" onclick="alert(1)">Heading</h2><style>body{display:none}</style><script>alert(1)</script><form><input value="secret"></form><img src="https://example.com/tracker" onerror="alert(1)"><a href="javascript:alert(1)">Bad</a><a href="https://example.com" target="_top" ping="https://example.com/ping">Good</a><img src="pk-blob:${'a'.repeat(64)}">`,
  );
  expect(html).toContain('<h2>Heading</h2>');
  expect(html).toContain(`src="pk-blob:${'a'.repeat(64)}"`);
  for (const forbidden of [
    'onclick',
    'onerror',
    '<script',
    '<style',
    '<form',
    '<input',
    'target=',
    'ping=',
    'id=',
    'javascript:',
    'tracker',
  ])
    expect(html).not.toContain(forbidden);
});
it('permits deliberate HTTP links and rejects unsafe schemes or embedded credentials', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///test',
    'https://user:password@example.com',
    'bad',
  ])
    expect(originalHttpUrl(url)).toBeNull();
  expect(originalHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
});
