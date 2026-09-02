/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

const configuredBase = process.env.POSTKEEPER_BASE_PATH ?? '/';
const base = configuredBase === '/' ? '/' : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`;

export default defineConfig({
  base,
  // Workspace commands run from apps/web; local OAuth configuration lives at the repo root.
  envDir: resolve(__dirname, '../..'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'PostKeeper',
        short_name: 'PostKeeper',
        start_url: './',
        display: 'standalone',
        background_color: '#f7f5ef',
        theme_color: '#17212b',
      },
      workbox: { navigateFallback: `${base}index.html`, cleanupOutdatedCaches: true },
    }),
  ],
  resolve: {
    alias: {
      '@postkeeper/capture-format': resolve(__dirname, '../../packages/capture-format/src'),
      '@postkeeper/capture-processing': resolve(__dirname, '../../packages/capture-processing/src'),
      '@postkeeper/domain': resolve(__dirname, '../../packages/domain/src'),
      '@postkeeper/local-store': resolve(__dirname, '../../packages/local-store/src'),
      '@postkeeper/test-fixtures': resolve(__dirname, '../../packages/test-fixtures/src'),
    },
  },
});
