import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

// Load .env from repository root (use relative path from apps/web)
dotenv.config({ path: '../../.env' });

const E2E_DB_HOST = process.env.E2E_DB_HOST || '127.0.0.1';
const isCI = !!process.env.CI;
const workers = parseInt(process.env.PW_WORKERS ?? '24', 10);
const prodWorkers = parseInt(process.env.PW_PROD_WORKERS ?? '2', 10);
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const useDev = process.env.USE_DEV === '0' || process.env.USE_DEV === 'false' ? false : true;

// Validate HMAC credentials for production tests
const E2E_USER = process.env.E2E_USER;
const E2E_SESSION_HMAC_SECRET = process.env.E2E_SESSION_HMAC_SECRET;

if (!E2E_USER || !E2E_SESSION_HMAC_SECRET) {
  console.warn(
    '[playwright] E2E_USER or E2E_SESSION_HMAC_SECRET missing – prod HMAC tests will fail.'
  );
}

// Auto-detect production vs local
const IS_PROD = /https?:\/\/(app\.)?ledger-mind\.org/i.test(baseURL);
const AUTH_STORAGE = './tests/.auth/storageState.json';
const PROD_STATE = './tests/e2e/.auth/prod-state.json';
const storageState = IS_PROD ? PROD_STATE : AUTH_STORAGE;

// Persistent profile for Google OAuth stability (zero re-login)
const userDataDir = path.join(process.cwd(), '../../.pw-userdata');

export default defineConfig({
  // Only run E2E specs; unit tests are handled by Vitest
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',  // E2E session mint
  globalTeardown: './tests/setup/global-teardown.ts',
  workers: useDev ? 1 : workers,  // serialize in dev to avoid SQLite locks
  timeout: 30_000,
  expect: { timeout: 3_000 },
  reporter: isCI ? [['html'], ['line']] : [['line']],
  retries: isCI ? 1 : 0,  // retry once in CI to guard against flakes
  use: {
    headless: false,  // headed mode for Google OAuth stability
    baseURL,
    storageState: storageState,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: true,
  },
  projects: IS_PROD
    ? [
        // Production: only run chromium-prod with @prod filter
        {
          name: 'chromium-prod',
          use: {
            ...devices['Desktop Chrome'],
            baseURL: process.env.BASE_URL || 'https://app.ledger-mind.org',
            storageState: PROD_STATE,
            video: 'retain-on-failure',
            trace: 'on-first-retry',
            headless: true,
            actionTimeout: 15_000,
            navigationTimeout: 20_000,
          },
          testIgnore: /@dev-only|@needs-seed/,
          grep: /@prod/,
          grepInvert: /@requires-llm/,
          retries: 1,
        },
      ]
    : [
        // Local: only run chromium (no @prod filter)
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ],
  webServer: process.env.PW_SKIP_WS ? undefined : [
    {
      command: 'pnpm run dev',
      cwd: process.cwd(),
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        // Point frontend at backend during E2E tests
        VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
        VITE_BACKEND_URL: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
        // Optional test flag
        VITE_ENV: 'e2e',
      },
    },
    {
      // Cross-platform: use virtual environment python
      command: process.platform === 'win32'
        ? '.venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8000'
        : '.venv/bin/python -m uvicorn app.main:app --port 8000',
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL || `postgresql+psycopg://app:app@${E2E_DB_HOST}:5432/app_e2e`,
        APP_ENV: 'dev',
        ALLOW_DEV_ROUTES: '1',
        DEV_SUPERUSER_EMAIL: process.env.DEV_SUPERUSER_EMAIL || 'leoklemet.pa@gmail.com',
        DEV_SUPERUSER_PIN: process.env.DEV_SUPERUSER_PIN || '946281',
        // Explicitly unset DEBUG to prevent Playwright's DEBUG=pw:* from breaking backend Pydantic settings
        DEBUG: undefined,
      },
    },
  ],
});
