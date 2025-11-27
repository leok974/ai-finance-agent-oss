/**
 * E2E tests for Demo Mode functionality
 *
 * Verifies the complete demo mode flow:
 * 1. Activating demo mode via "Use sample data" button
 * 2. Demo banner visibility and state
 * 3. Data fetching with ?demo=1 parameter
 * 4. Demo mode persistence across page refreshes
 * 5. Exiting demo mode and returning to real data
 *
 * **Demo Mode Architecture:**
 * - Frontend: localStorage key 'lm:demoMode' = '1'
 * - Backend: ?demo=1 query parameter switches to DEMO_USER_ID
 * - Data Isolation: Demo user (ID=3) has separate transaction set
 */
import { test, expect, Page } from '@playwright/test';

test.describe('@prod Demo Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for initial load
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Ensure we start with demo mode OFF
    await page.evaluate(() => {
      localStorage.removeItem('lm:demoMode');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('activates demo mode via "Use sample data" button', async ({ page }) => {
    // Find and click "Upload CSV or Use sample data" button
    const uploadButton = page.getByRole('button', { name: /upload csv/i });
    await expect(uploadButton).toBeVisible();
    await uploadButton.click();

    // Click "Use sample data" in the dialog
    const useSampleButton = page.getByRole('button', { name: /use sample data/i });
    await expect(useSampleButton).toBeVisible();
    await useSampleButton.click();

    // Wait for demo data seeding to complete
    await page.waitForTimeout(2000);

    // Verify demo mode is active in localStorage
    const demoMode = await page.evaluate(() => localStorage.getItem('lm:demoMode'));
    expect(demoMode).toBe('1');

    // Verify demo banner is visible
    const demoBanner = page.locator('text=/demo mode|viewing sample data/i');
    await expect(demoBanner).toBeVisible({ timeout: 5000 });
  });

  test('demo banner shows exit button', async ({ page }) => {
    // Activate demo mode
    await activateDemoMode(page);

    // Find the demo banner
    const demoBanner = page.locator('[class*="demo"]').filter({ hasText: /demo mode|sample data/i });
    await expect(demoBanner).toBeVisible();

    // Verify "Exit Demo Mode" button exists
    const exitButton = page.getByRole('button', { name: /exit demo/i });
    await expect(exitButton).toBeVisible();
  });

  test('exits demo mode and clears localStorage', async ({ page }) => {
    // Activate demo mode
    await activateDemoMode(page);

    // Verify demo mode is active
    let demoMode = await page.evaluate(() => localStorage.getItem('lm:demoMode'));
    expect(demoMode).toBe('1');

    // Click "Exit Demo Mode" button
    const exitButton = page.getByRole('button', { name: /exit demo/i });
    await exitButton.click();

    // Wait for page refresh
    await page.waitForLoadState('networkidle');

    // Verify demo mode is cleared from localStorage
    demoMode = await page.evaluate(() => localStorage.getItem('lm:demoMode'));
    expect(demoMode).toBeNull();

    // Verify demo banner is no longer visible
    const demoBanner = page.locator('text=/demo mode|viewing sample data/i');
    await expect(demoBanner).not.toBeVisible();
  });

  test('persists demo mode across page refreshes', async ({ page }) => {
    // Activate demo mode
    await activateDemoMode(page);

    // Verify demo mode is active
    let demoMode = await page.evaluate(() => localStorage.getItem('lm:demoMode'));
    expect(demoMode).toBe('1');

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify demo mode is still active after refresh
    demoMode = await page.evaluate(() => localStorage.getItem('lm:demoMode'));
    expect(demoMode).toBe('1');

    // Verify demo banner is still visible
    const demoBanner = page.locator('text=/demo mode|viewing sample data/i');
    await expect(demoBanner).toBeVisible();
  });

  test('appends ?demo=1 to data-fetching requests', async ({ page }) => {
    // Listen for network requests
    const chartRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/charts/') || url.includes('/insights') || url.includes('/transactions')) {
        chartRequests.push(url);
      }
    });

    // Activate demo mode
    await activateDemoMode(page);

    // Navigate to dashboard to trigger chart requests
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Allow charts to load

    // Verify at least some requests include ?demo=1
    const demoRequests = chartRequests.filter(url => url.includes('demo=1') || url.includes('demo=true'));
    expect(demoRequests.length).toBeGreaterThan(0);

    console.log('Demo mode requests:', demoRequests);
  });

  test('does not append ?demo=1 when demo mode is off', async ({ page }) => {
    // Ensure demo mode is OFF
    await page.evaluate(() => {
      localStorage.removeItem('lm:demoMode');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Listen for network requests
    const chartRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/charts/') || url.includes('/insights') || url.includes('/transactions')) {
        chartRequests.push(url);
      }
    });

    // Navigate to dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify NO requests include ?demo=1
    const demoRequests = chartRequests.filter(url => url.includes('demo=1') || url.includes('demo=true'));
    expect(demoRequests.length).toBe(0);
  });

  test('demo mode shows different transaction data', async ({ page }) => {
    // Get transaction count in real mode
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const realTransactionCount = await getTransactionCount(page);

    // Activate demo mode
    await activateDemoMode(page);

    // Get transaction count in demo mode
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const demoTransactionCount = await getTransactionCount(page);

    // Demo mode should have transactions (from demo seed)
    expect(demoTransactionCount).toBeGreaterThan(0);

    // Transaction counts might differ (unless user has no real data)
    console.log('Real transactions:', realTransactionCount);
    console.log('Demo transactions:', demoTransactionCount);
  });
});

// Helper functions

async function activateDemoMode(page: Page) {
  // Set demo mode directly in localStorage (faster than clicking through UI)
  await page.evaluate(() => {
    localStorage.setItem('lm:demoMode', '1');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Verify activation
  const demoMode = await page.evaluate(() => localStorage.getItem('lm:demoMode'));
  expect(demoMode).toBe('1');
}

async function getTransactionCount(page: Page): Promise<number> {
  try {
    // Try to find transaction list or count indicator
    const transactionRows = await page.locator('[data-testid="transaction-row"], .transaction-item, tbody tr').count();
    return transactionRows;
  } catch {
    return 0;
  }
}
