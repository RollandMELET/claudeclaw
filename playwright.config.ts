import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for War Room v2 e2e tests.
 *
 * The real user-flow specs (Slices 1-8) boot the dev dashboard on port 3142
 * before running. The Slice 0 baseline spec does not require a running server.
 *
 * To run the full suite with a live dashboard, start it in another terminal:
 *   DASHBOARD_PORT=3142 WARROOM_PORT=7861 WARROOM_DEV_MODE=1 npm run dev
 * Then:
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3142',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
