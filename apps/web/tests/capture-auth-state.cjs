// Script to capture auth state from Chrome profile into Playwright storageState
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const userDataDir = path.join(__dirname, '..', '..', '..', '.pw-userdata');
const outputPath = path.join(__dirname, '.auth', 'storageState.json');

async function captureAuthState() {
  console.log('Launching browser with profile:', userDataDir);

  // Launch persistent context (reuses the Chrome profile we logged into)
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    baseURL: 'https://app.ledger-mind.org',
  });

  console.log('Navigating to app to verify login...');
  const page = await context.newPage();
  await page.goto('https://app.ledger-mind.org');

  // Wait a bit for any auth redirects
  await page.waitForTimeout(3000);

  console.log('Saving storage state...');
  await context.storageState({ path: outputPath });

  console.log('✓ Auth state saved to:', outputPath);
  console.log('✓ You can now run tests with this authenticated state');

  await context.close();
}

captureAuthState().catch(console.error);
