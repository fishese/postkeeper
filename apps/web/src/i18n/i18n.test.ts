import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createTranslator, formatBytes, t } from './index';

test('plural counts, named parameter reordering, locale formatting and missing-message fallback', () => {
  expect(t('library.items', { count: 0 })).toBe('0 items');
  expect(t('library.items', { count: 1 })).toBe('1 item');
  expect(t('library.items', { count: 1200 })).toBe('1,200 items');
  const translated = createTranslator('de', {
    'storage.used': '{quota} / {usage}',
    'library.items': { one: '{count} Eintrag', other: '{count} Einträge' },
  });
  expect(translated('library.items', { count: 1200 })).toBe('1.200 Einträge');
  expect(translated('storage.used', { usage: '10 MB', quota: '20 MB' })).toBe('20 MB / 10 MB');
  expect(translated('common.close')).toBe('Close');
  expect(createTranslator('ru')('library.items', { count: 21 })).toBe('21 items');
  expect(formatBytes(1024)).toMatch(/1\s*kB/);
});

test('interpolated values remain literal text and are never evaluated as message syntax', () => {
  expect(t('transfer.imported', { title: '<img onerror="alert(1)">{count}' })).toBe(
    'Imported “<img onerror="alert(1)">{count}” from the browser extension.',
  );
});

test('shipping React screens keep text and accessible labels in the catalog', () => {
  const files = [
    'App',
    'About',
    'LibraryApp',
    'SharedLinks',
    'CaptureActions',
    'ArticleSharing',
    'BackupPanel',
    'SyncPanel',
    'Reader',
    'ui/Sheet',
  ];
  const hardcoded: string[] = [];
  for (const file of files) {
    const source = readFileSync(new URL('../' + file + '.tsx', import.meta.url), 'utf8');
    const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && /[a-z]/i.test(node.text))
        hardcoded.push(file + ': ' + node.text.trim());
      if (
        ts.isJsxAttribute(node) &&
        ['aria-label', 'title', 'placeholder'].includes(node.name.getText(root)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      )
        hardcoded.push(file + ': ' + node.initializer.text);
      ts.forEachChild(node, visit);
    }
    visit(root);
  }
  expect(hardcoded).toEqual([]);
});
