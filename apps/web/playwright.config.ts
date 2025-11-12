import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const E2E_DB_HOST = process.env.E2E_DB_HOST || '127.0.0.1';
const isCI = !!process.env.CI;
const workers = parseInt(process.env.PW_WORKERS ?? '24', 10);
const prodWorkers = parseInt(process.env.PW_PROD_WORKERS ?? '2', 10); // ✅ Conservative default for prod
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
// default to dev server so /api proxy works in E2E unless explicitly disabled
const useDev = process.env.USE_DEV === '0' || process.env.USE_DEV === 'false' ? false : true;
const storageStatePath = './tests/e2e/.auth/state.json';
const PROD_STATE = './tests/e2e/.auth/prod-state.json';
const AUTH_STORAGE = './tests/.auth/storageState.json';

// Persistent profile for Google OAuth stability (zero re-login)
// Path relative to repository root
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
    storageState: AUTH_STORAGE,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    // Main chromium tests with shared auth state
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Production testing project (uses captured state for CI)
    {
      name: 'chromium-prod',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.BASE_URL || 'https://app.ledger-mind.org',
        storageState: PROD_STATE,            // ✅ use captured prod state if available
        video: 'retain-on-failure',
        trace: 'on-first-retry',
        headless: true,
        actionTimeout: 15_000,               // ✅ Longer timeout for prod network latency
        navigationTimeout: 20_000,           // ✅ Longer timeout for prod navigation
      },
      testIgnore: /@dev-only|@needs-seed/,    // ✅ skip any dev/seed-only tests
      grep: /@prod/,                          // ✅ only run tests tagged @prod
      grepInvert: /@requires-llm/,            // ✅ exclude LLM-dependent tests by default
      retries: 1,                             // ✅ Retry once on prod to handle flakes
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
