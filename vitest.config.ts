import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { exclude: ['tests/browser/**', 'tests/extension/**', 'node_modules/**', 'dist/**'] },
  resolve: {
    alias: {
      '@postkeeper/capture-format': resolve(__dirname, 'packages/capture-format/src'),
      '@postkeeper/capture-processing': resolve(__dirname, 'packages/capture-processing/src'),
      '@postkeeper/domain': resolve(__dirname, 'packages/domain/src'),
      '@postkeeper/local-store': resolve(__dirname, 'packages/local-store/src'),
      '@postkeeper/sync-core': resolve(__dirname, 'packages/sync-core/src'),
      '@postkeeper/sync-google-drive': resolve(__dirname, 'packages/sync-google-drive/src'),
      '@postkeeper/test-fixtures': resolve(__dirname, 'packages/test-fixtures/src'),
    },
  },
});
