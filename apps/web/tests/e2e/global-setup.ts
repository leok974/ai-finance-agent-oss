/**
 * Playwright global setup - E2E session minting
 *
 * Production E2E only: Mints authenticated session for https://app.ledger-mind.org
 * using HMAC authentication.
 *
 * Required env vars for prod:
 * - BASE_URL: https://app.ledger-mind.org (or matching ledger-mind.org)
 * - E2E_SESSION_HMAC_SECRET: Shared secret for HMAC signing
 * - E2E_USER: User email (default: leoklemet.pa@gmail.com)
 *
 * Non-prod URLs: Session minting is skipped entirely.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";

const PROD_STATE = path.resolve('tests/e2e/.auth/prod-state.json');

function isProdBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  return baseUrl.includes('ledger-mind.org');
}

async function createProdSession(baseUrl: string) {
  const hmacSecret = process.env.E2E_SESSION_HMAC_SECRET;
  if (!hmacSecret) {
    throw new Error(
      'E2E_SESSION_HMAC_SECRET must be set for prod E2E. ' +
      'This should match the backend E2E_SESSION_HMAC_SECRET configuration.'
    );
  }

  const user = process.env.E2E_USER ?? 'leoklemet.pa@gmail.com';
  const ts = Math.floor(Date.now() / 1000);
  const msg = `${user}.${ts}`;

  const sig = crypto
    .createHmac('sha256', hmacSecret)
    .update(msg, 'utf8')
    .digest('hex');

  console.log(`[global-setup] Minting prod session for ${user} at ${baseUrl}/api/e2e/session`);

  const requestContext = await request.newContext();

  try {
    const resp = await requestContext.post(`${baseUrl}/api/e2e/session`, {
      headers: {
        'content-type': 'application/json',
        'x-e2e-ts': String(ts),
        'x-e2e-sig': sig,
      },
      data: { user },
      failOnStatusCode: false,
    });

    if (!resp.ok()) {
      const body = await resp.text();
      throw new Error(
        `Failed to create prod E2E session: ${resp.status()} ${resp.statusText}\n` +
        `Body: ${body.slice(0, 500)}`
      );
    }

    const payload = await resp.json();
    if (!payload.ok) {
      throw new Error(
        `E2E session returned ok=false: ${JSON.stringify(payload).slice(0, 300)}`
      );
    }

    console.log(`[global-setup] Session created successfully for ${payload.user || user}`);

    const storageState = await requestContext.storageState();
    await fs.mkdir(path.dirname(PROD_STATE), { recursive: true });
    await fs.writeFile(PROD_STATE, JSON.stringify(storageState, null, 2), 'utf8');

    console.log(`[global-setup] Saved ${storageState.cookies.length} cookies to ${PROD_STATE}`);
  } finally {
    await requestContext.dispose();
  }
}

export default async function globalSetup(config: FullConfig) {
  const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

  console.log(`[global-setup] Starting E2E setup for BASE_URL: ${BASE_URL}`);

  if (!isProdBaseUrl(BASE_URL)) {
    console.log('[global-setup] Non-prod BASE_URL detected - skipping session mint');
    console.log('[global-setup] (Prod E2E requires BASE_URL containing "ledger-mind.org")');
    return;
  }

  // Check if prod-state.json already exists
  try {
    await fs.access(PROD_STATE);
    console.log('[global-setup] Found existing prod-state.json - skipping session mint');
    console.log('[global-setup] (Delete it to force re-authentication)');
    return;
  } catch {
    // File doesn't exist, need to mint session
  }

  await createProdSession(BASE_URL);
}
