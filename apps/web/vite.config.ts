/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

const configuredBase = process.env.POSTKEEPER_BASE_PATH ?? '/';
const base = configuredBase === '/' ? '/' : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version,
    ),
  },
  base,
  // Workspace commands run from apps/web; local OAuth configuration lives at the repo root.
  envDir: resolve(__dirname, '../..'),
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt'],
      manifest: {
        name: 'PostKeeper',
        short_name: 'PostKeeper',
        start_url: './',
        display: 'standalone',
        background_color: '#f7f5ef',
        theme_color: '#17212b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        importScripts: ['share-target.js'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [
          /\/(?:privacy\.html|terms\.html|LICENSE\.txt|THIRD_PARTY_NOTICES\.txt)$/u,
        ],
        cleanupOutdatedCaches: true,
      },
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
