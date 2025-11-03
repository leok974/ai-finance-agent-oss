import { test, expect } from '@playwright/test';
import { baseUrl, joinUrl, apiBase, apiRoot, ingestUrl } from './utils/env';

/* eslint-disable no-console */

// Use helpers to avoid double-port issues

test.describe.configure({ mode: 'serial' });

type Failure = {
  kind: 'response' | 'requestfailed' | 'console';
  url?: string;
  method?: string;
  status?: number;
  failureText?: string;
  consoleType?: string;
  consoleText?: string;
  snippet?: string;
};

function classify(u: string, status?: number, method?: string, failureText?: string) {
  const url = new URL(u);
  const path = url.pathname;
  // 401/403 on auth routes: expected when unauthenticated
  if ((status === 401 || status === 403) && (
    path.startsWith('/api/auth/') || path === '/api/auth/me' || path === '/api/auth/refresh'
  )) return 'auth_guarded';
  // 401/403 on protected app routes (agent/ingest): expected if not logged in
  if ((status === 401 || status === 403) && (
    path.startsWith('/agent/') || path.startsWith('/ingest/')
  )) return 'auth_guarded';
  if ((status === 404 || status === 405) && method === 'OPTIONS') return 'preflight_optional';
  if (status === 405 && (path.includes('/meta/') || path.includes('/charts/'))) return 'wrong_method';
  if (status === 404 && path.startsWith('/assets/')) return 'missing_asset';
  if (failureText?.includes('ERR_CONNECTION_CLOSED')) return 'conn_closed_external';
  if (status && status >= 400) return 'unexpected_http';
  if (failureText) return 'unexpected_network';
  return 'other';
}

test('diagnose console/network errors and probe endpoint methods', async ({ page, request }) => {
  test.slow();
  const base = baseUrl;

  const events: Failure[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      events.push({ kind: 'console', consoleType: msg.type(), consoleText: msg.text() });
    }
  });

  page.on('requestfailed', (req) => {
    events.push({
      kind: 'requestfailed',
      url: req.url(),
      method: req.method(),
      failureText: req.failure()?.errorText,
    });
  });

  page.on('response', async (resp) => {
    const status = resp.status();
    if (status >= 400) {
      const url = resp.url();
      const method = resp.request().method();
      let snippet = '';
      try { snippet = (await resp.text()).slice(0, 160); } catch { /* ignore */ }
      events.push({ kind: 'response', url, method, status, snippet });
    }
  });

  await page.goto(joinUrl(base, '/'), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/LedgerMind/i);

  const alias = await request.get(`${apiBase()}/metrics`, { maxRedirects: 0 });
  expect(alias.status()).toBe(307);
  {
    const loc = alias.headers()['location'];
    expect(loc).toBeTruthy();
    expect(/\/metrics$/.test(loc || '')).toBeTruthy();
  }

  const metaPath = `/agent/tools/meta/latest_month`;
  const probes = [
    { name: 'META POST', res: await request.post(`${apiRoot()}${metaPath}`, { data: {} }) },
    { name: 'ING POST',  res: await request.post(`${ingestUrl()}?replace=false`, { multipart: { file: { name: 'dummy.csv', mimeType: 'text/csv', buffer: Buffer.from('col1\nval1') } } }) },
  ];

  const probeSummary = await Promise.all(probes.map(async p => ({
    name: p.name,
    status: p.res.status(),
    text: (await p.res.text()).slice(0, 120),
  })));

  const rows = events.map(e => {
    if (e.kind === 'response') {
      return {
        kind: e.kind,
        status: e.status,
        method: e.method,
        url: e.url,
        class: classify(e.url!, e.status, e.method),
        snippet: e.snippet,
      };
    } else if (e.kind === 'requestfailed') {
      return {
        kind: e.kind,
        method: e.method,
        url: e.url,
        failure: e.failureText,
        class: classify(e.url!, undefined, e.method, e.failureText),
      };
    } else {
      return { kind: e.kind, consoleType: e.consoleType, consoleText: e.consoleText };
    }
  });

  console.log('\n=== PROBE SUMMARY ===');
  console.table(probeSummary);
  console.log('\n=== FAILING RESPONSES / REQUESTS / CONSOLE ===');
  console.table(rows);

  const hardFailures = rows.filter(r =>
    (r.kind === 'response' && (r.class === 'missing_asset' || r.class === 'unexpected_http')) ||
    (r.kind === 'requestfailed' && r.class === 'unexpected_network')
  );

  expect(hardFailures, `Hard failures detected:\n${JSON.stringify(hardFailures, null, 2)}`).toHaveLength(0);
});
