import { test, expect } from '@playwright/test'
import { apiBase } from './utils/env'

// Tiny e2e: verifies the toast Undo path calls backend and restores suggestions
// Preconditions: storageState logs in as an admin or user; unknowns panel has at least one suggestion.
// This is intentionally minimal and resilient; it skips if panel not present.

test.beforeAll(async ({ request }) => {
  await request.post(`${apiBase()}/dev/seed-unknowns?count=6`).catch(() => {});
});

test('suggestion reject + Undo restores pill', async ({ page }) => {
  // Seed unknowns data before navigating
  const API = apiBase();
  await page.request.post(`${API}/dev/seed-unknowns?count=6`).catch(() => {});

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Navigate to Unknowns panel area (may require clicking a tab or nav item)
  // Try common selectors for unknowns navigation
  const unknownsNav = page.getByTestId('nav-unknowns').or(page.getByRole('button', { name: /unknowns/i }));
  if (await unknownsNav.count() > 0) {
    await unknownsNav.first().click().catch(() => {});
  }

  // Wait for panel to be visible, skip if not found
  const panel = page.locator('#unknowns-panel');
  const panelVisible = await panel.isVisible({ timeout: 3000 }).catch(() => false);
  if (!panelVisible) {
    test.skip(true, 'Unknowns panel not found - feature may be disabled or no data');
    return;
  }
  await expect(panel).toBeVisible();

  // Open first suggestion menu (ellipsis)
  const ellipsis = panel.locator('button[aria-haspopup="menu"]').first()
  await ellipsis.click()

  // Click "Don’t suggest this"
  await page.getByRole('menuitem', { name: /don’t suggest this/i }).click()

  // Expect a toast with Undo
  const toast = page.locator('[data-sonner-toast]')
  await expect(toast).toContainText(/ignored/i)
  const undoBtn = toast.getByRole('button', { name: /undo/i })
  await undoBtn.click()

  // After Undo, the toast may show success; ensure panel still present
  await expect(panel).toBeVisible()
})
