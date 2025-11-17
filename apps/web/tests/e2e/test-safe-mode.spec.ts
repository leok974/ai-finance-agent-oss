import { test, expect } from '@playwright/test';

test('chat safe mode renders minimal boot', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('[chat]') || text.includes('SAFE MODE')) {
      console.log('[SAFE MODE TEST]', text);
    }
  });

  page.on('pageerror', error => {
    console.error('[PAGE ERROR]', error.message);
    logs.push(`ERROR: ${error.message}`);
  });

  await page.goto('https://app.ledger-mind.org/?chat=1', {
    waitUntil: 'networkidle',
    timeout: 15000
  });

  // Wait for ChatDock v2 shell to be visible
  const shell = page.locator('[data-testid="lm-chat-shell"]');
  await expect(shell).toBeVisible({ timeout: 5000 });

  // Check for safe mode indicator (now in direct DOM, no iframe)
  const safeDiv = page.locator('[data-chat-safe="1"]');
  await expect(safeDiv).toBeVisible({ timeout: 5000 });

  const text = await safeDiv.textContent();
  console.log('✅ Safe mode text:', text);

  expect(text).toContain('Chat minimal boot OK');

  // Verify no errors
  const errors = logs.filter(l => l.includes('ERROR'));
  if (errors.length > 0) {
    console.error('❌ Errors found:', errors);
  }
  expect(errors.length).toBe(0);

  console.log('\n✅ Safe mode test PASSED - ChatDock v2 boots with minimal React');
});
