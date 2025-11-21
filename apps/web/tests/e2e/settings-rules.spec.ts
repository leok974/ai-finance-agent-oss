import { test, expect } from '@playwright/test';

test.describe('@prod Settings drawer rules', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(process.env.BASE_URL ?? 'https://app.ledger-mind.org', {
      waitUntil: 'load',
      timeout: 60000,
    });

    // Wait for auth to complete by checking for account menu
    await page.waitForSelector('[data-testid="account-menu"]', { timeout: 30000 });
  });

  test('Settings menu item opens drawer and shows rules', async ({ page }) => {
    // Open account menu
    const accountMenu = page.getByTestId('account-menu');
    await expect(accountMenu).toBeVisible({ timeout: 5000 });
    await accountMenu.click();

    // Click Settings
    const settingsItem = page.getByTestId('account-menu-settings');
    await expect(settingsItem).toBeVisible({ timeout: 5000 });
    await settingsItem.click();

    // Verify drawer opens
    const drawer = page.getByTestId('settings-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Verify header content
    await expect(drawer.getByText('Settings')).toBeVisible();
    await expect(drawer.getByText('Auto-categorization rules')).toBeVisible();

    // Check if there are any rules
    const ruleRow = drawer.getByTestId('settings-rule-row').first();
    const hasRules = await ruleRow.isVisible().catch(() => false);

    if (hasRules) {
      // Verify rule row structure
      await expect(ruleRow).toBeVisible();

      // Check for toggle and delete buttons
      const toggle = ruleRow.getByTestId('settings-rule-toggle');
      const deleteBtn = ruleRow.getByTestId('settings-rule-delete');
      await expect(toggle).toBeVisible();
      await expect(deleteBtn).toBeVisible();
    } else {
      // Verify empty state message
      await expect(
        drawer.getByText(/No rules yet/i)
      ).toBeVisible();
    }
  });

  test('Can toggle rule active state', async ({ page }) => {
    // Open account menu and settings
    await page.getByTestId('account-menu').click();
    await page.getByTestId('account-menu-settings').click();

    const drawer = page.getByTestId('settings-drawer');
    await expect(drawer).toBeVisible();

    // Find first rule (if any exist)
    const ruleRow = drawer.getByTestId('settings-rule-row').first();
    const hasRules = await ruleRow.isVisible().catch(() => false);

    if (hasRules) {
      const toggle = ruleRow.getByTestId('settings-rule-toggle');
      const initialText = await toggle.textContent();

      // Click toggle
      await toggle.click();

      // Wait for toast to appear (indicates successful toggle)
      const toast = page.getByText(/Rule (enabled|disabled)/i).first();
      await expect(toast).toBeVisible({ timeout: 3000 });

      // Verify toggle text changed
      const newText = await toggle.textContent();
      expect(newText).not.toBe(initialText);
    } else {
      test.skip();
    }
  });

  test('Settings drawer closes when clicking close button', async ({ page }) => {
    // Open settings
    await page.getByTestId('account-menu').click();
    await page.getByTestId('account-menu-settings').click();

    const drawer = page.getByTestId('settings-drawer');
    await expect(drawer).toBeVisible();

    // Find and click close button (X icon)
    const closeButton = drawer.getByRole('button', { name: /close/i });
    await closeButton.click();

    // Verify drawer closes
    await expect(drawer).not.toBeVisible({ timeout: 2000 });
  });
});
