import { defineConfig } from '@playwright/test';
import { E2E_DEMO_URL, E2E_URL } from './e2e/db.ts';

// End-to-end tests (e2e/): the built client and the real server against a
// fresh database with the demo data, in the installed Chrome, one at a time
// (they share the data). See docs/engineering/testing.md.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: E2E_URL,
    channel: 'chrome',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    viewport: { width: 1400, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run build && node e2e/serve.ts',
      url: `${E2E_URL}/api/trpc/Auth.me`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'pipe',
    },
    // The demo itself (DEMO_DATA): demo.spec.ts. It waits for the build above to serve the client.
    {
      command: 'node e2e/serve.ts --demo',
      url: `${E2E_DEMO_URL}/api/trpc/Auth.me`,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'pipe',
    },
  ],
});
