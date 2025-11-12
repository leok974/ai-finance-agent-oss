import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/auth-google.spec.ts',
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['line']],
  retries: 0,
  use: {
    headless: true,
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // No dependencies - run tests directly without auth setup
    },
  ],
  // No webServer - testing against live production
});
