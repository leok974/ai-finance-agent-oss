import { test } from '@playwright/test';
import { ensureLoggedIn } from './utils/auth';
import { expectSuggestionsVisible } from './utils/suggestions';
import { uploadCsvAndWait } from './utils/upload';

const SKIP_SUGGESTIONS = process.env.E2E_SKIP_SUGGESTIONS === '1';

/**
 * End-to-end: after ingesting a CSV via the UI, the Suggestions card should be visible.
 * Uses UI login to avoid CSRF nuances.
 */

(SKIP_SUGGESTIONS ? test.describe.skip : test.describe)('Suggestions after ingest', () => {
  test('upload triggers suggestions fetch (card visible)', async ({ page }) => {
    // Gate on backend readiness to avoid startup races
    await page.request.get('/api/ready');
    await ensureLoggedIn(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // Ingest via UI (UploadCsv component)
    // Open file chooser by clicking the dropzone label (it wraps the hidden input)
    const filePath = process.env.E2E_CSV ?? 'tests/fixtures/demo.csv';
    const suggestionsResponse = page.waitForResponse(
      (resp) => /\/agent\/tools\/suggestions($|\?)/.test(resp.url()) && resp.ok(),
      { timeout: 30_000 }
    );
    await uploadCsvAndWait(page, filePath, { timeout: 40_000 });

    // Wait for suggestions fetch to complete successfully
    await suggestionsResponse;

    // Assert Suggestions card visible (feature-flag dependent build)
    await expectSuggestionsVisible(page);
  });
});
