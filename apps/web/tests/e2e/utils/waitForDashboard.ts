import { Page, expect } from '@playwright/test';

/**
 * Wait for the dashboard to load after authentication.
 * This ensures the app is fully loaded and ready for interaction.
 */
export async function waitForDashboard(page: Page) {
  // Wait for the dashboard root element to be visible
  await expect(page.getByTestId('dashboard')).toBeVisible({
    timeout: 30000,
  });
}
