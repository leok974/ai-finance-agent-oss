import { test, expect } from '@playwright/test';
import { withForcedAnalytics } from './helpers/baseUrl';
import { applyNetOptimizations } from './helpers/net-optimizations';
import { ensureSuggestionsPanelOrSkip } from './utils/panel';

interface EventPayload { event?: string; ts?: number; props?: Record<string, unknown>; }

test.describe.configure({ mode: 'serial' });

test('Analytics emits suggestion_create_error on save failure', async ({ page }) => {
  await applyNetOptimizations(page);

  const STUB = process.env.PLAYWRIGHT_STUB_ANALYTICS === '1';
  const events: EventPayload[] = [];

  await page.route('**/agent/analytics/event', async route => {
    const req = route.request();
    const raw = req.postData();
    if (raw) {
      try {
        events.push(JSON.parse(raw));
      } catch {
        events.push({});
      }
    }

    if (STUB) {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });

  await page.route('**/agent/tools/suggestions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ merchant: 'Err Cafe', suggest_category: 'Coffee', confidence: 0.9, support: 3 }] }),
    });
  });

  await page.route('**/agent/tools/rules/save', async route => {
    await route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
  });

  const base = withForcedAnalytics(process.env.BASE_URL || 'http://127.0.0.1');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await ensureSuggestionsPanelOrSkip(page);

  const btn = page.getByTestId('suggestions-create').first();
  await expect(btn).toBeVisible();
  await btn.click();

  await expect(page.getByText('Error').first()).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText(/Error creating rule/i);

  if (STUB) {
    const names = events.map(e => e?.event);
    expect(names).toContain('suggestion_create_attempt');
    expect(names).toContain('suggestion_create_error');
  } else {
    await expect.poll(() => events.map(e => e?.event)).toContain('suggestion_create_attempt');
    await expect.poll(() => events.some(e => e?.event === 'suggestion_create_error')).toBeTruthy();
  }
});
