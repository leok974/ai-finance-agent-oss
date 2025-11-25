#!/usr/bin/env node
/**
 * Clean test artifacts, reports, and build outputs.
 * Run: pnpm clean:artifacts
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

const paths = [
  // Playwright test artifacts
  "apps/web/test-results",
  "apps/web/playwright-report",
  "apps/web/.playwright",
  "apps/web/.last-run.json",

  // Vitest / generic coverage
  "apps/web/.vitest",
  "apps/web/coverage",
  ".nyc_output",

  // Python test artifacts
  ".pytest_cache",
  "apps/backend/.pytest_cache",
  "apps/backend/htmlcov",
  "htmlcov",

  // Build outputs
  "apps/web/dist",
  "apps/backend/dist",

  // Generic test/coverage dirs
  "coverage",
  "test-results",
  "playwright-report",
];

async function removePath(p) {
  try {
    const fullPath = join(process.cwd(), p);
    await rm(fullPath, { recursive: true, force: true });
    console.log(`✓ Removed ${p}`);
  } catch (err) {
    // Only show error if it's not ENOENT (file not found)
    if (err.code !== 'ENOENT') {
      console.warn(`⚠ Skipped ${p}: ${err.message}`);
    }
  }
}

(async () => {
  console.log('[clean] Removing test artifacts and build outputs...\n');

  for (const p of paths) {
    await removePath(p);
  }

  console.log('\n[clean] Done! Disk space freed.');
})();
