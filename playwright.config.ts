import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command:
      'npm run build && npm run preview --workspace=@postkeeper/web -- --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium-local', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'firefox-playwright', use: { browserName: 'firefox' } },
  ],
});
