import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-*/**',
      '**/build/**',
      '**/node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'apps/android/**/assets/**',
      'apps/android/.gradle/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/prepare-android.mjs', 'scripts/m6-fixture-server.mjs'],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommended,
  {
    files: [
      'scripts/test-milestone5-emulator.mjs',
      'scripts/test-milestone6-emulator.mjs',
      'apps/web/public/share-target.js',
    ],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
