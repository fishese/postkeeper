import type { Library } from '@postkeeper/local-store';
import {
  CAPTURE_EXTRACTOR_VERSION,
  CAPTURE_SANITIZER_VERSION,
} from '@postkeeper/capture-processing';

export type SyncDiagnostics = {
  phase: 'local' | 'pending' | 'synced' | 'error' | 'conflict' | 'reconnect-required';
  connected: boolean;
  lastSuccess: string | null;
};
export const LOCAL_SYNC_DIAGNOSTICS: SyncDiagnostics = {
  phase: 'local',
  connected: false,
  lastSuccess: null,
};

const knownMethods = new Set([
  'pending-link',
  'android-capture-browser',
  'trusted-fixture',
  'development-fixture',
  'chromium-extension',
  'firefox-extension',
  'browser-extension',
]);
const knownWarnings = new Set([
  'pending-link',
  'native-cross-origin-image',
  'native-image-unavailable',
  'missing-asset',
  'extraction-failed',
  'unsupported-frame',
  'asset-fetch-failed',
  'asset-too-large',
  'unsupported-media-type',
]);
function counts(values: string[], allowed: Set<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const candidate = value.split(':')[0];
    const key = allowed.has(candidate) ? candidate : 'other';
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export async function createDiagnostics(library: Library, sync: SyncDiagnostics): Promise<string> {
  const metadata = await library.getBackupMetadata();
  const storage = await library.getStorageStatus();
  // Extract only a browser family/version. Never export the raw user agent or page URLs.
  const browser =
    /(?:Firefox|Edg|Chrome|Version)\/[0-9.]+/u.exec(navigator.userAgent)?.[0] ?? 'unknown';
  return JSON.stringify(
    {
      format: 'postkeeper-diagnostics',
      formatVersion: 1,
      applicationVersion: __APP_VERSION__,
      generatedAt: new Date().toISOString(),
      browser,
      extensionVersion: 'not-recorded',
      processing: { extractor: CAPTURE_EXTRACTOR_VERSION, sanitizer: CAPTURE_SANITIZER_VERSION },
      counts: {
        articles: metadata.articles.length,
        categories: metadata.categories.length,
        memberships: metadata.memberships.length,
        snapshots: metadata.snapshots.length,
      },
      captureMethods: counts(
        metadata.snapshots.map((v) => v.captureMethod),
        knownMethods,
      ),
      warningCodes: counts(
        metadata.articles.flatMap((v) => v.warnings),
        knownWarnings,
      ),
      storage: {
        persisted: storage.persisted,
        usageBytes: storage.usage,
        quotaBytes: storage.quota,
        blobBackend: storage.blobBackend,
      },
      sync: {
        provider: sync.connected ? 'google-drive' : 'disconnected',
        phase: sync.phase,
        lastSuccessfulCheckpoint: sync.lastSuccess,
      },
      redaction:
        'No titles, URLs, content, record IDs, credentials, session storage, recovery keys, or transient logs. Counts and device storage usage remain visible.',
    },
    null,
    2,
  );
}
