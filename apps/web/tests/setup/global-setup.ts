import { chromium, request, type FullConfig } from '@playwright/test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';
const EMAIL    = process.env.PW_EMAIL!;
const PASSWORD = process.env.PW_PASSWORD!;

// Where we'll write the cookies/session:
const STORAGE = 'apps/web/tests/.auth/storageState.json';

// 1) Fast-path: if the saved state is still valid, keep it.
async function stateStillValid() {
  try {
    const ctx = await request.newContext({ baseURL: BASE_URL, storageState: STORAGE });
    const res = await ctx.get('/api/auth/me', { failOnStatusCode: false });
    await ctx.dispose();
    return res.status() === 200;
  } catch {
    return false;
  }
}

// 2) UI login flow (adjust selectors to match your login form)
async function loginViaUI() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // Wait until we're really logged in:
  await page.waitForResponse((r) => r.url().endsWith('/api/auth/me') && r.ok(), { timeout: 15_000 });
  
  // Save storage state
  await fs.mkdir(path.dirname(STORAGE), { recursive: true });
  await page.context().storageState({ path: STORAGE });
  await browser.close();
  
  console.log('[global-setup] UI login successful, state saved to', STORAGE);
}

// 3) API login flow if you expose an auth endpoint
async function loginViaAPI() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  // Change this to your real login route/shape:
  const res = await ctx.post('/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
    failOnStatusCode: false,
  });
  
  if (res.status() !== 200) {
    const body = await res.text();
    throw new Error(`API login failed: ${res.status()} - ${body}`);
  }
  
  // Persist session cookies:
  const state = await ctx.storageState();
  await ctx.dispose();

  await fs.mkdir(path.dirname(STORAGE), { recursive: true });
  await fs.writeFile(STORAGE, JSON.stringify(state, null, 2));
  
  console.log('[global-setup] API login successful, state saved to', STORAGE);
}

async function ensureAuthState() {
  // Check if credentials are provided
  if (!EMAIL || !PASSWORD) {
    console.warn('[global-setup] PW_EMAIL or PW_PASSWORD not set, skipping auth setup');
    console.warn('[global-setup] Set these env vars to enable authenticated tests');
    return;
  }

  // Check current state:
  if (await stateStillValid()) {
    console.log('[global-setup] Existing auth state is still valid');
    return;
  }

  console.log('[global-setup] Auth state invalid or missing, logging in...');

  // Try API login first (fast + no flake). If not available, fall back to UI.
  try {
    await loginViaAPI();
  } catch (err) {
    console.warn('[global-setup] API login failed, trying UI login...', err);
    await loginViaUI();
  }

  // Verify:
  if (!(await stateStillValid())) {
    throw new Error('Auth state is not valid after login.');
  }
  
  console.log('[global-setup] Auth state verified and ready');
}

export default async function globalSetup(_config: FullConfig) {
  await ensureAuthState();
}
