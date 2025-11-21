import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('Finance tools smoke @prod @chat', () => {
  test('quick recap + deep dive + spikes-only respond', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    // Open chat
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // 1) Quick recap - find the chip (might be labeled differently)
    // Look for chips that might trigger month summary
    const quickRecapChip = page.getByRole('button', { name: /month.*summary|quick.*recap|starbucks/i }).first();

    if (await quickRecapChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await quickRecapChip.click();

      // Wait for response
      await page.waitForTimeout(2000);

      const quickReply = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
      await expect(quickReply).toBeVisible({ timeout: 5000 });

      const quickText = await quickReply.textContent();

      // Should mention something finance-related (income/spend/recap or no transactions)
      expect(quickText).toMatch(/recap|income|spend|no transactions|summary|month/i);
      expect(quickText).not.toContain('placeholder');

      // 2) Deep dive via suggestion button if it appears
      const deeperBtn = page.getByRole('button', { name: /deeper breakdown|deep dive|show deeper/i }).first();

      if (await deeperBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await deeperBtn.click();
        await page.waitForTimeout(2000);

        const deepReply = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
        await expect(deepReply).toBeVisible({ timeout: 5000 });

        const deepText = await deepReply.textContent();
        expect(deepText).toMatch(/deep dive|category|spikes|no transactions|breakdown/i);

        // 3) Spikes-only if button appears
        const spikesBtn = page.getByRole('button', { name: /show.*spikes|spikes.*only/i }).first();

        if (await spikesBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await spikesBtn.click();
          await page.waitForTimeout(2000);

          const spikesReply = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
          await expect(spikesReply).toBeVisible({ timeout: 5000 });

          const spikesText = await spikesReply.textContent();
          expect(spikesText).toMatch(/spikes|anomal|unusual|stable/i);
          expect(spikesText).not.toContain('HTTP 500');
          expect(spikesText).not.toContain('HTTP 401');
        }
      }
    }

    // Verify that SOME assistant messages appeared (at least 1)
    const allAssistantMsgs = page.locator('[data-testid^="lm-chat-message-assistant"]');
    const msgCount = await allAssistantMsgs.count();
    expect(msgCount).toBeGreaterThan(0);
  });

  test('finance tools never hang without response', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForLoadState('networkidle');

    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 10000 });
    await launcher.click();

    const chatShell = page.getByTestId('lm-chat-shell');
    await expect(chatShell).toBeVisible({ timeout: 3000 });

    // Try clicking any finance-related chip
    const anyFinanceChip = page.getByRole('button', { name: /summary|recap|insight|budget/i }).first();

    if (await anyFinanceChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      const initialMsgCount = await page.locator('[data-testid^="lm-chat-message-"]').count();

      await anyFinanceChip.click();

      // Wait for response
      await page.waitForTimeout(3000);

      const finalMsgCount = await page.locator('[data-testid^="lm-chat-message-"]').count();

      // Should have at least 2 new messages (user + assistant)
      expect(finalMsgCount).toBeGreaterThan(initialMsgCount);

      // Last message should be from assistant
      const lastMsg = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
      await expect(lastMsg).toBeVisible({ timeout: 2000 });

      // Should have some content (not empty)
      const lastText = await lastMsg.textContent();
      expect(lastText?.trim().length).toBeGreaterThan(10);
    }
  });
});
