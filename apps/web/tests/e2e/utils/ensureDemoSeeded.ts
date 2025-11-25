import { Page, expect } from '@playwright/test';

/**
 * Ensure demo user is logged in and sample data is seeded.
 * This makes E2E tests self-sufficient by guaranteeing a known dataset.
 *
 * Flow:
 * 1. Click "Try Demo" button on landing page (creates demo session)
 * 2. Wait for dashboard to load
 * 3. Click "Use sample data" to seed transactions
 * 4. Wait for data to populate (verify top categories card shows content)
 */
export async function ensureDemoSeeded(page: Page) {
  // Navigate to root (landing page if not authenticated)
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  // Check if already logged in (demo banner or account menu visible)
  const demoBanner = page.getByTestId('demo-banner');
  const accountMenu = page.getByTestId('account-menu');

  const alreadyLoggedIn =
    (await demoBanner.isVisible().catch(() => false)) ||
    (await accountMenu.isVisible().catch(() => false));

  if (!alreadyLoggedIn) {
    // Click "Try Demo" button to create demo session
    const demoButton = page.getByTestId('btn-demo');
    await expect(demoButton).toBeVisible({ timeout: 10000 });
    await demoButton.click();

    // Wait for navigation to complete and dashboard to load
    await page.waitForURL('/', { timeout: 30000 });
  }

  // Verify demo banner is visible (confirms demo session)
  await expect(demoBanner).toBeVisible({ timeout: 10000 });

  // Click "Use sample data" button
  const useSampleButton = page.getByTestId('use-sample-data');
  await expect(useSampleButton).toBeVisible({ timeout: 10000 });
  await useSampleButton.click();

  // Wait for data to load - verify top categories card shows content
  // The card should contain category names like "transfers", "groceries", "shopping", etc.
  const topCategoriesCard = page.getByTestId('top-categories-card');
  await expect(topCategoriesCard).toBeVisible({ timeout: 30000 });

  // Wait for actual content to appear (not just the empty card)
  // Look for any category-related text or chart elements
  await expect(topCategoriesCard).toContainText(/total|transfers|groceries|shopping|rent|subscriptions|utilities/i, {
    timeout: 30000,
  });
}
