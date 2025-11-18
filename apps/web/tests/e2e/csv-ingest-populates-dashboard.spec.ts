/**
 * E2E test: CSV ingest with realistic data
 *
 * Verifies that CSV upload:
 * 1. Successfully processes valid transactions
 * 2. Returns correct counts and detected month
 * 3. Properly handles error cases (empty files, malformed data)
 */
/**
 * CSV Ingest E2E Tests
 *
 * @prod Production E2E tests for CSV upload functionality
 *
 * These tests verify the complete CSV upload flow including:
 * - Successful upload with transaction parsing
 * - Error handling for empty CSVs
 * - Error handling for malformed CSVs
 *
 * **Auth:** Uses page.request (not request fixture) to preserve storage state cookies
 * from global-setup.ts which mints an authenticated session before tests run.
 *
 * **Prod E2E:** When BASE_URL=https://app.ledger-mind.org, global-setup calls
 * /api/e2e/session with HMAC auth to get real session cookies saved to prod-state.json.
 *
 * **Running:**
 *   export BASE_URL=https://app.ledger-mind.org
 *   export E2E_SESSION_HMAC_SECRET=<your-secret>
 *   export E2E_USER=leoklemet.pa@gmail.com
 *   pnpm playwright test --project=chromium-prod
 */
import { test, expect } from '@playwright/test';
import { ingestUrl } from './utils/env';

test.describe('@prod CSV ingest', () => {
  test('upload realistic CSV returns success with correct counts', async ({ page }) => {
    // Navigate to app first to establish authenticated session (loads storage state cookies)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create a realistic CSV with November 2025 transactions
    const csvContent = [
      'date,amount,description,merchant,account,category',
      '2025-11-01,1250.00,PAYROLL DEPOSIT,ACME CORP,Checking,Income',
      '2025-11-02,-45.67,GROCERY STORE,WHOLE FOODS,Checking,Groceries',
      '2025-11-05,-89.99,AMAZON PURCHASE,AMAZON.COM,Credit Card,Shopping',
      '2025-11-10,-120.00,ELECTRIC BILL,UTILITY CO,Checking,Utilities',
      '2025-11-15,-200.00,RENT PAYMENT,LANDLORD,Checking,Housing',
      '2025-11-25,-145.00,GROCERIES,SAFEWAY,Checking,Groceries',
    ].join('\n');

    // Get cookies and send with request
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const uploadResp = await page.request.post(`${ingestUrl()}?replace=true`, {
      headers: {
        Cookie: cookieHeader,
      },
      multipart: {
        file: {
          name: 'export_nov2025.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8'),
        },
      },
    });

    expect(uploadResp.status(), 'Upload should return 200').toBe(200);

    const uploadData = await uploadResp.json();
    expect(uploadData.ok, 'Upload response should have ok:true').toBe(true);
    expect(uploadData.added, 'Should have added transactions').toBeGreaterThan(0);
    expect(uploadData.count, 'Should have count > 0').toBeGreaterThan(0);
    expect(uploadData.detected_month, 'Should detect month').toBe('2025-11');
    expect(uploadData.date_range, 'Should have date range').toBeDefined();
    expect(uploadData.date_range.earliest, 'Should have earliest date').toBe('2025-11-01');
  });

  test('empty CSV returns error with ok:false', async ({ page }) => {
    // Navigate to app first to establish authenticated session
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emptyCsv = 'date,amount,description,merchant\n';

    // Get cookies and send with request
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const uploadResp = await page.request.post(`${ingestUrl()}?replace=false`, {
      headers: {
        Cookie: cookieHeader,
      },
      multipart: {
        file: {
          name: 'empty.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(emptyCsv, 'utf-8'),
        },
      },
    });

    expect(uploadResp.status()).toBe(200);

    const uploadData = await uploadResp.json();
    expect(uploadData.ok, 'Empty CSV should return ok:false').toBe(false);
    expect(uploadData.added, 'Empty CSV should have added:0').toBe(0);
    expect(uploadData.error, 'Should have error field').toBeDefined();
    expect(['empty_file', 'no_rows_parsed']).toContain(uploadData.error);
  });

  test('malformed CSV returns error or ok:false', async ({ page }) => {
    // Navigate to app first to establish authenticated session
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const badCsv = 'when,amt,shop,note\n2025-11-01,50,Store,Stuff\n';

    // Get cookies and send with request
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const uploadResp = await page.request.post(`${ingestUrl()}?replace=false`, {
      headers: {
        Cookie: cookieHeader,
      },
      multipart: {
        file: {
          name: 'bad.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(badCsv, 'utf-8'),
        },
      },
    });

    expect(uploadResp.status()).toBeGreaterThanOrEqual(200);
    expect(uploadResp.status()).toBeLessThan(500);

    if (uploadResp.status() === 200) {
      const uploadData = await uploadResp.json();
      if (uploadData.added === 0) {
        expect(uploadData.ok).toBe(false);
        expect(uploadData.message || uploadData.error).toBeDefined();
      }
    }
  });

  test('@prod csv ingest shows friendly success message in UI', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create a test CSV with a few transactions
    const csvContent = [
      'date,amount,description,merchant',
      '2025-11-10,-35.50,Coffee Shop,STARBUCKS',
      '2025-11-11,-120.00,Groceries,WHOLE FOODS',
      '2025-11-12,-15.99,Streaming,NETFLIX',
    ].join('\n');

    // Find the file input and upload
    const fileInput = page.getByTestId('uploadcsv-input');
    
    // Create a file-like buffer for the upload
    await fileInput.setInputFiles({
      name: 'test_transactions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    // Click the upload button
    const uploadButton = page.getByTestId('uploadcsv-submit');
    await uploadButton.click();

    // Wait for the success message to appear
    const summary = page.getByTestId('csv-ingest-summary');
    await expect(summary).toBeVisible({ timeout: 10000 });
    
    // Verify the friendly message contains expected text
    await expect(summary).toContainText('CSV ingested successfully');
    await expect(summary).toContainText('transaction');
  });
});
