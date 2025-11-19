import { test, expect } from '@playwright/test';

test('@prod @account account menu is readable and shows email', async ({ page }) => {
  await page.goto('/');

  const trigger = page.getByTestId('account-menu');
  await expect(trigger).toBeVisible();
  await trigger.click();

  // Email should be visible and not truncated
  const email = page.getByText('@', { exact: false });
  await expect(email).toBeVisible();

  // Both action items should be visible
  await expect(page.getByTestId('account-menu-copy-email')).toBeVisible();
  await expect(page.getByTestId('account-menu-logout')).toBeVisible();
});
