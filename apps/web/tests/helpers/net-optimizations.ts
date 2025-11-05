import { Page } from '@playwright/test';

/** Blocks known-noise third-party requests to reduce flake & speed up */
export async function applyNetOptimizations(page: Page) {
  await page.route('**/beacon.min.js/**', route => route.abort());
}
