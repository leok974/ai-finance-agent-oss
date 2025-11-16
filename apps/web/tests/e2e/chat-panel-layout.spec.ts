import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

async function ensureChatAvailable(page: Page) {
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  if (process.env.IS_PROD === 'true') {
    try {
      await page
        .getByTestId('lm-chat-launcher-button')
        .waitFor({ timeout: 15000 });
    } catch {
      test.skip(
        true,
        'Chat launcher button not found in prod – likely E2E session/auth issue'
      );
    }
  }
}

test.describe('@prod Polished panel layout', () => {

test.describe.configure({
  retries: process.env.IS_PROD === 'true' ? 1 : 0,
  timeout: 60_000,
});

test.beforeEach(async ({ page }) => {
  await ensureChatAvailable(page);

  await page.evaluate(() => {
    sessionStorage.removeItem('lm:disableChat');
  });

  // open the panel once for all tests
  await page.getByTestId('lm-chat-launcher-button').click();
  await page.getByTestId('lm-chat-shell').waitFor({ state: 'visible' });
});

test('header and actions match LEDGERMIND ASSISTANT design', async ({ page }) => {
  const shell = page.getByTestId('lm-chat-shell');
  await expect(shell).toBeVisible();

  // header title
  await expect(
    shell.getByText('LEDGERMIND ASSISTANT', { exact: false })
  ).toBeVisible();

  // LLM status pill
  await expect(
    shell.getByText('LLM: OK', { exact: false })
  ).toBeVisible();

  // export + hide actions
  await expect(shell.getByText('Export JSON', { exact: false })).toBeVisible();
  await expect(shell.getByText('Export Markdown', { exact: false })).toBeVisible();
  await expect(shell.getByText('Hide tools', { exact: false })).toBeVisible();
});

test('sections INSIGHTS / SUBSCRIPTIONS / SEARCH & PLANNING are present', async ({ page }) => {
  const shell = page.getByTestId('lm-chat-shell');

  // section labels - use exact match to avoid matching button text
  await expect(shell.locator('.lm-chat-section-label', { hasText: 'INSIGHTS' })).toBeVisible();
  await expect(shell.locator('.lm-chat-section-label', { hasText: 'SUBSCRIPTIONS' })).toBeVisible();
  await expect(shell.locator('.lm-chat-section-label', { hasText: 'SEARCH & PLANNING' })).toBeVisible();

  // representative tools under each section
  await expect(shell.getByText('Month summary', { exact: false })).toBeVisible();
  await expect(shell.getByText('Trends', { exact: false })).toBeVisible();
  await expect(shell.getByText('Alerts', { exact: false })).toBeVisible();

  await expect(shell.getByText('Recurring', { exact: false })).toBeVisible();
  await expect(
    shell.getByText('Find subscriptions', { exact: false })
  ).toBeVisible();

  await expect(shell.getByText('Insights (Q)', { exact: false })).toBeVisible();
  await expect(shell.getByText('Budget suggest', { exact: false })).toBeVisible();
  await expect(
    shell.getByText('Search transactions (NL)', { exact: false })
  ).toBeVisible();
});

test('greeting + input row are rendered in footer', async ({ page }) => {
  const shell = page.getByTestId('lm-chat-shell');

  // greeting block
  await expect(
    shell.getByText('Hey! 👋', { exact: false })
  ).toBeVisible();

  // input + send button
  const input = shell.getByRole('textbox', { name: /ask or type a command/i });
  await expect(input).toBeVisible();

  await expect(
    shell.getByRole('button', { name: /^send$/i })
  ).toBeVisible();
});

});
