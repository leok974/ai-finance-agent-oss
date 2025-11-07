import { chromium } from "@playwright/test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "https://app.ledger-mind.org";
const OUT = path.resolve(__dirname, "prod-state.json");

async function attachToRemoteChrome(cdpUrl = 'http://127.0.0.1:9222') {
  try {
    console.log(`🔌 Attempting to connect to remote Chrome via CDP at ${cdpUrl}...`);
    const browser = await chromium.connectOverCDP(cdpUrl);
    // Prefer an existing context if available
    const contexts = browser.contexts();
    if (contexts.length > 0) {
      console.log('ℹ️  Reusing existing browser context.');
      return contexts[0];
    }
    console.log('ℹ️  No existing context found — creating a new context attached to remote Chrome.');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    return ctx;
  } catch (err) {
    const e: any = err;
    console.error('⚠️  Could not connect to remote Chrome via CDP:', e?.message ?? e);
    return null;
  }
}

(async () => {
  console.log('➡️  Capture script starting');

  const useCdp = !!process.env.CAPTURE_CDP || !!process.env.ATTACH_REMOTE;
  let ctx: any = null;

  if (useCdp) {
    console.log('ℹ️  CAPTURE_CDP enabled — please start Chrome with remote debugging enabled.');
    console.log('   Example (PowerShell):');
    console.log('     "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\tmp\\prod-profile"');
    console.log('   After Chrome is running, the script will attach to it and open the app.');
    ctx = await attachToRemoteChrome(process.env.CDP_URL || 'http://127.0.0.1:9222');
    if (!ctx) {
      console.error('❌ Failed to attach to remote Chrome. Falling back to Playwright-launched persistent context (may be blocked by Google).');
    }
  }

  if (!ctx) {
    // Fallback: launch a Playwright persistent context (may be blocked by Google sign-in detection)
    console.log('ℹ️  Launching Playwright persistent Chromium context (headed)...');
    ctx = await chromium.launchPersistentContext(path.resolve(__dirname, '.user-data-prod'), {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
  }

  const page = await ctx.newPage();

  console.log('➡️  Opening app…', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});

  console.log("\n👉 If not logged in, sign in using Google in the opened browser and complete OAuth.");
  console.log("   When the dashboard is visible, press ENTER in this terminal to save state.");

  process.stdin.resume();
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  const state = await ctx.storageState();
  await fs.writeFile(OUT, JSON.stringify(state, null, 2), 'utf8');
  console.log('✅ Saved:', OUT);

  // If we connected over CDP, do not close the remote browser; just close the context
  try { await ctx.close(); } catch {}
  process.exit(0);
})();
