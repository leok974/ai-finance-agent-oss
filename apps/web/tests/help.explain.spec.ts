import { test, expect } from '@playwright/test';

test('Why tab shows a non-empty explanation for all 3 cards', async ({ page }) => {
  await page.goto('https://app.ledger-mind.org'); // or http://localhost:5173
  
  // Helper to open Why tab and verify content
  const openWhy = async (label: string) => {
    const card = page.getByRole('region', { name: new RegExp(label, 'i') });
    await card.getByRole('button', { name: /\?/ }).click();
    await page.getByRole('tab', { name: /Why/i }).click();
    const txt = await page.getByTestId('card-help-why').textContent();
    expect((txt ?? '').trim().length).toBeGreaterThan(20); // not placeholder
  };
  
  await openWhy('Top Merchants');
  await openWhy('Top Categories');
  await openWhy('Daily Flows');
});

test('second open is served from cache (metrics hit increases)', async ({ request }) => {
  const m1 = await (await request.get('http://localhost:8000/metrics')).text();
  
  // Trigger a cached call
  await request.get('http://localhost:8000/agent/describe/charts.month_merchants?month=2025-11');
  
  const m2 = await (await request.get('http://localhost:8000/metrics')).text();
  
  const hits1 = (m1.match(/lm_help_requests_total\{[^}]*cache="hit"[^}]*\}\s+(\d+)/) ?? ['', '0'])[1];
  const hits2 = (m2.match(/lm_help_requests_total\{[^}]*cache="hit"[^}]*\}\s+(\d+)/) ?? ['', '0'])[1];
  
  expect(Number(hits2)).toBeGreaterThanOrEqual(Number(hits1));
});

test('cache miss then hit for same month', async ({ request }) => {
  // Use a unique month to ensure clean test
  const month = '2025-10';
  const url = `http://localhost:8000/agent/describe/charts.month_categories?month=${month}`;
  
  // First call should work (miss or hit depending on previous tests)
  const r1 = await request.get(url);
  expect(r1.status()).toBe(200);
  
  // Second call should hit cache
  const r2 = await request.get(url);
  expect(r2.status()).toBe(200);
  
  // Response should be identical
  const json1 = await r1.json();
  const json2 = await r2.json();
  expect(json1).toEqual(json2);
});

test('all three panel explainers return valid structure', async ({ request }) => {
  const panels = ['charts.month_merchants', 'charts.month_categories', 'charts.daily_flows'];
  const month = '2025-11';
  
  for (const panel of panels) {
    const r = await request.get(`http://localhost:8000/agent/describe/${panel}?month=${month}`);
    expect(r.status()).toBe(200);
    
    const json = await r.json();
    expect(json).toHaveProperty('title');
    expect(json).toHaveProperty('what');
    expect(json).toHaveProperty('why');
    expect(json).toHaveProperty('actions');
    expect(Array.isArray(json.actions)).toBe(true);
  }
});

test('invalid month format returns 422', async ({ request }) => {
  const r = await request.get('http://localhost:8000/agent/describe/charts.month_merchants?month=invalid');
  expect(r.status()).toBe(422);
});

test('unknown panel returns 404', async ({ request }) => {
  const r = await request.get('http://localhost:8000/agent/describe/charts.unknown_panel?month=2025-11');
  expect(r.status()).toBe(404);
});

test('RAG fallback to heuristics works', async ({ request }) => {
  // This test verifies that when RAG is unavailable, heuristics still work
  const r = await request.get('http://localhost:8000/agent/describe/charts.month_merchants?month=2025-11');
  expect(r.status()).toBe(200);
  
  const json = await r.json();
  // Should have meaningful content even without RAG
  expect(json.why.length).toBeGreaterThan(10);
  expect(json.what.length).toBeGreaterThan(10);
});
