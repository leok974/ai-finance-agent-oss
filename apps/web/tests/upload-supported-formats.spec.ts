import { test, expect } from '@playwright/test';

/**
 * E2E test verifying the "Supported CSV column layouts" documentation is visible
 * in the UploadCsv component.
 *
 * This test ensures users can see what CSV column layouts are accepted before upload,
 * helping them understand why a file might fail and what shapes are supported.
 */

test('@frontend shows supported CSV column layouts documentation', async ({ page }) => {
  // Navigate to the main page (adjust URL if needed)
  await page.goto('/');

  // Wait for page to fully load
  await page.waitForLoadState('networkidle');

  // Verify the "Supported CSV column layouts" header is visible
  const formatHeader = page.getByText('Supported CSV column layouts');
  await expect(formatHeader).toBeVisible();

  // Verify all 4 format types are listed
  await expect(page.getByText('LedgerMind CSV')).toBeVisible();
  await expect(page.getByText('Bank Export v1')).toBeVisible();
  await expect(page.getByText('Bank Debit/Credit')).toBeVisible();
  await expect(page.getByText('Bank Posted/Effective')).toBeVisible();

  // Verify column examples are shown for each format

  // LedgerMind format columns
  await expect(page.locator('code:has-text("date")').first()).toBeVisible();
  await expect(page.locator('code:has-text("merchant")').first()).toBeVisible();
  await expect(page.locator('code:has-text("description")').first()).toBeVisible();
  await expect(page.locator('code:has-text("amount")').first()).toBeVisible();
  await expect(page.locator('code:has-text("category")').first()).toBeVisible();

  // Bank Export v1 columns (some shared with other formats)
  await expect(page.locator('code:has-text("Comments")')).toBeVisible();
  await expect(page.locator('code:has-text("Check Number")')).toBeVisible();
  await expect(page.locator('code:has-text("Balance")')).toBeVisible();

  // Bank Debit/Credit columns
  await expect(page.locator('code:has-text("Debit")')).toBeVisible();
  await expect(page.locator('code:has-text("Credit")')).toBeVisible();

  // Bank Posted/Effective columns
  await expect(page.locator('code:has-text("Posted Date")')).toBeVisible();
  await expect(page.locator('code:has-text("Effective Date")')).toBeVisible();
  await expect(page.locator('code:has-text("Type")')).toBeVisible();

  // Verify the helpful note about case-insensitivity and auto-detection
  await expect(page.getByText(/CSV headers are case-insensitive/i)).toBeVisible();
  await expect(page.getByText(/auto-detected/i)).toBeVisible();
});

test('@frontend formats documentation appears before upload results', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Get the formats box and upload button
  const formatsBox = page.getByText('Supported CSV column layouts');
  const uploadButton = page.getByTestId('uploadcsv-submit');

  // Both should be visible
  await expect(formatsBox).toBeVisible();
  await expect(uploadButton).toBeVisible();

  // Formats documentation should come after the upload button in the DOM
  const formatsBoxHandle = await formatsBox.elementHandle();
  const uploadButtonHandle = await uploadButton.elementHandle();

  if (formatsBoxHandle && uploadButtonHandle) {
    const formatsY = await formatsBoxHandle.evaluate(el => el.getBoundingClientRect().top);
    const buttonY = await uploadButtonHandle.evaluate(el => el.getBoundingClientRect().top);

    // Formats box should be below the button
    expect(formatsY).toBeGreaterThan(buttonY);
  }
});
