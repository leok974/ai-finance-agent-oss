import { test, expect } from '@playwright/test';
import { withForcedAnalytics } from './helpers/baseUrl';
import { applyNetOptimizations } from './helpers/net-optimizations';
import { ensureSuggestionsPanelOrSkip } from './utils/panel';

interface EventPayload { event?: string; ts?: number; props?: Record<string, unknown>; }

test.describe.configure({ mode: 'serial' });

test('Suggestions analytics: attempt + success events', async ({ page }) => {
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
      body: JSON.stringify({
        items: [
          { merchant: 'Blue Bottle Coffee', suggest_category: 'Coffee', confidence: 0.92, support: 7 },
        ],
      }),
    });
  });

  await page.route('**/agent/tools/rules/save', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  const base = withForcedAnalytics(process.env.BASE_URL || 'http://127.0.0.1');
  await page.goto(base);
  await ensureSuggestionsPanelOrSkip(page);

  const btn = page.getByTestId('suggestions-create').first();
  await btn.click();

  if (STUB) {
    await expect(page.getByTestId('toast')).toContainText(/Rule created/i);
    const names = events.map(e => e?.event);
    expect(names).toContain('suggestion_create_attempt');
    expect(names.some(n => n === 'suggestion_create_success' || n === 'suggestion_create_exists')).toBeTruthy();
  } else {
    await expect.poll(() => events.map(e => e?.event)).toContain('suggestion_create_attempt');
    await expect.poll(() => events.some(e => e?.event === 'suggestion_create_success' || e?.event === 'suggestion_create_exists')).toBeTruthy();
  }

  const attempt = events.find(e => e?.event === 'suggestion_create_attempt');
  expect(attempt?.props?.merchant).toBeDefined();
  expect(attempt?.props?.category).toBeDefined();
});
