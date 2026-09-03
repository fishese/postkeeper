// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openLibrary } from '@postkeeper/local-store';
import { PUBLIC_FIXTURE } from '@postkeeper/test-fixtures';
import { createDiagnostics } from './diagnostics';

it('exports only allowlisted codes and aggregate diagnostics, never content or raw warning URLs', async () => {
  const library = await openLibrary({ name: `diagnostics-disposable-${crypto.randomUUID()}` });
  const article = await library.importTrustedFixture({
    ...PUBLIC_FIXTURE,
    title: 'PRIVATE_TITLE',
    originalUrl: 'https://example.com?token=PRIVATE_URL',
  });
  const original = library.getBackupMetadata.bind(library);
  library.getBackupMetadata = async () => {
    const metadata = await original();
    metadata.articles[0].warnings = [
      'missing-asset:https://example.com?token=PRIVATE_WARNING',
      'PRIVATE_UNKNOWN',
    ];
    metadata.snapshots[0].captureMethod = 'PRIVATE_METHOD';
    metadata.snapshots[0].extractorVersion = 'PRIVATE_VERSION';
    return metadata;
  };
  const text = await createDiagnostics(library, {
    phase: 'reconnect-required',
    connected: false,
    lastSuccess: '2026-09-03T00:00:00.000Z',
  });
  expect(text).not.toContain('PRIVATE_');
  expect(text).not.toContain(article.id);
  expect(JSON.parse(text).warningCodes).toEqual({ 'missing-asset': 1, other: 1 });
  expect(JSON.parse(text).sync.lastSuccessfulCheckpoint).toBe('2026-09-03T00:00:00.000Z');
  await library.close();
});
