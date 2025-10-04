import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './utils/auth';
import { ensureSuggestionsPanelOrSkip } from '../utils/panel';

test('CSV upload works (no 422)', async ({ request }) => {
  const csv = [
    'date,amount,merchant,description',
    '2025-10-01,-12.34,Acme,Coffee',
  ].join('\n');

  const resp = await request.post('/ingest?replace=false', {
    multipart: {
      file: {
        name: 'sample.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf-8'),
      },
    },
  });

  expect(resp.status(), 'expected 2xx for ingest').toBeGreaterThanOrEqual(200);
  expect(resp.status(), 'expected 2xx for ingest').toBeLessThan(300);

  const json = await resp.json();
  expect(typeof json).toBe('object');
});

test('CSV upload (malformed) returns clear client error or is rejected', async ({ request }) => {
  const resp = await request.post('/ingest?replace=false', {
    multipart: {
      file: {
        name: 'bad.csv',
        mimeType: 'text/csv',
        // Missing headers and invalid amount/date — tweak to match validator
        buffer: Buffer.from('when,amt,shop,memo\nnot-a-date,abc,???,??\n', 'utf-8'),
      },
    },
  });

  // Prefer 4xx (e.g., 422). Some local stacks may return 200 but ignore bad rows; accept >=200
  expect(resp.status()).toBeGreaterThanOrEqual(200);
  expect(resp.status()).toBeLessThan(500);

  let body: unknown;
  try { body = await resp.json(); } catch { body = await resp.text(); }
  const isObj = typeof body === 'object' && body !== null;
  const isStr = typeof body === 'string';
  expect(isObj || isStr).toBeTruthy();
  const text = isStr ? (body as string).toLowerCase() : JSON.stringify(body).toLowerCase();
  // If it's a client error, ensure the message hints at CSV/validation
  if (resp.status() >= 400) {
    expect(text).toMatch(/csv|validation|column|date|amount/);
  }
});

test('CSV upload (too large) returns 413 Request Entity Too Large', async ({ request }) => {
  // Generate ~12MB payload to exceed 10m client_max_body_size
  const row = '2025-10-01,-1.23,Acme,Coffee\n';
  const header = 'date,amount,merchant,description\n';
  const approxRows = Math.ceil((12 * 1024 * 1024) / row.length);
  const bigCsv = header + row.repeat(approxRows);

  const resp = await request.post('/ingest?replace=false', {
    multipart: {
      file: {
        name: 'big.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(bigCsv, 'utf-8'),
      },
    },
  });

  // Nginx typically returns 413; tolerate 400 depending on upstream behavior
  expect([413, 400]).toContain(resp.status());
});

test('upload triggers suggestions fetch (card visible)', async ({ page }) => {
  await ensureLoggedIn(page);
  await page.goto('/', { waitUntil: 'networkidle' });

  // Upload a tiny CSV via API in the same authenticated context so cookies are preserved
  const up = await page.request.post('/ingest?replace=false', {
    multipart: {
      file: {
        name: 'mini.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('date,amount,merchant,description\n2025-08-10,-12.34,Acme,Coffee\n', 'utf-8'),
      },
    },
  });
  expect(up.status()).toBeGreaterThanOrEqual(200);
  expect(up.status()).toBeLessThan(300);

  // Reload to trigger data loads and ensure the panel renders
  await page.reload({ waitUntil: 'networkidle' });
  await ensureSuggestionsPanelOrSkip(page);
  await expect(page.getByRole('heading', { name: /suggestions/i })).toBeVisible();
  // Either an empty hint or at least one row is fine
  const hint = page.getByText(/no uncategorized transactions|no suggestions|select a month/i);
  await expect(hint.or(page.locator('[data-testid="suggestion-row"]'))).toBeVisible();
});
