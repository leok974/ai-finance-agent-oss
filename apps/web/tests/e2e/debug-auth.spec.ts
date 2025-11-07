import { test, expect } from '@playwright/test';

test('Debug OAuth UI', async ({ page }) => {
  // Navigate to app
  await page.goto('https://app.ledger-mind.org/');

  // Wait a bit for any dynamic content
  await page.waitForTimeout(3000);

  // Get the entire body HTML
  const bodyHTML = await page.locator('body').innerHTML();
  console.log('=== FULL PAGE HTML (first 5000 chars) ===');
  console.log(bodyHTML.substring(0, 5000));

  // Try to find any button
  const allButtons = await page.locator('button').all();
  console.log(`\n=== FOUND ${allButtons.length} BUTTONS ===`);
  for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
    const text = await allButtons[i].textContent();
    const testId = await allButtons[i].getAttribute('data-testid');
    console.log(`Button ${i}: text="${text}" testid="${testId}"`);
  }

  // Check what's in the auth area
  const authArea = await page.locator('header').innerHTML();
  console.log('\n=== HEADER HTML ===');
  console.log(authArea);

  // Check /api/auth/me response
  const response = await page.request.get('https://app.ledger-mind.org/api/auth/me');
  console.log(`\n=== /api/auth/me status: ${response.status()} ===`);
  const body = await response.text();
  console.log(body);
});
