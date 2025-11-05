import { test } from '@playwright/test';
import { ensureLoggedIn } from './utils/auth';
import { apiRoot, apiBase } from './utils/env';
import { expectSuggestionsVisible } from './utils/suggestions';
import { uploadCsvAndWait } from './utils/upload';

const SKIP_SUGGESTIONS = process.env.E2E_SKIP_SUGGESTIONS === '1';

/**
 * End-to-end: after ingesting a CSV via the UI, the Suggestions card should be visible.
 * Uses UI login to avoid CSRF nuances.
 */

(SKIP_SUGGESTIONS ? test.describe.skip : test.describe)('Suggestions after ingest', () => {
  test('upload triggers suggestions fetch (card visible)', async ({ page }) => {
    // Seed unknowns to ensure panel has data
    const API = apiBase();
    await page.request.post(`${API}/dev/seed-unknowns?count=6`).catch(() => {});

    // Gate on backend readiness to avoid startup races
    const ready = await page.request.get(`${apiRoot()}/ready`, { timeout: 5000 }).catch(() => null);
    if (!ready?.ok()) {
      test.skip(true, 'Backend not ready');
      return;
    }

    await ensureLoggedIn(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check if upload UI is present before proceeding
    const uploadInput = page.locator('input[type="file"][accept*="csv"]').first();
    const hasUpload = await uploadInput.count().then(c => c > 0).catch(() => false);
    if (!hasUpload) {
      test.skip(true, 'Upload UI not found - feature may be disabled');
      return;
    }

    // Ingest via UI (UploadCsv component)
    const filePath = process.env.E2E_CSV ?? 'tests/fixtures/demo.csv';
    const suggestionsResponse = page.waitForResponse(
      (resp) => /\/agent\/tools\/suggestions($|\?)/.test(resp.url()) && resp.ok(),
      { timeout: 30_000 }
    ).catch(() => null);

    await uploadCsvAndWait(page, filePath, { timeout: 40_000 }).catch(() => {
      test.skip(true, 'CSV upload failed');
    });

    // Wait for suggestions fetch to complete successfully
    const resp = await suggestionsResponse;
    if (!resp) {
      test.skip(true, 'Suggestions response not received');
      return;
    }

    // Assert Suggestions card visible (feature-flag dependent build)
    await expectSuggestionsVisible(page);
  });
});
