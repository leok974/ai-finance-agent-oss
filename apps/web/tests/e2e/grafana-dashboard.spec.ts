import { test, expect, request, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Grafana Dashboard Smoke Test
 *
 * Validates that the ML Suggestions dashboard exists and has expected panels/queries.
 *
 * Required:
 *   GRAFANA_URL:     https://grafana.example.com
 *   GRAFANA_API_KEY: Grafana PAT with Viewer + API access
 *
 * Optional:
 *   GRAFANA_DASH_TITLE: Dashboard title (default: "LedgerMind — ML Suggestions")
 *   GRAFANA_IMPORT_IF_MISSING: "1" to auto-import if not found (requires GRAFANA_DASH_JSON_PATH)
 *   GRAFANA_DASH_JSON_PATH: Path to dashboard JSON (default: ops/grafana/ml_suggestions_dashboard.json)
 */

const GRAFANA_URL = process.env.GRAFANA_URL;
const GRAFANA_API_KEY = process.env.GRAFANA_API_KEY;
const DASH_QUERY = process.env.GRAFANA_DASH_TITLE || 'LedgerMind — ML Suggestions';
const IMPORT_IF_MISSING = process.env.GRAFANA_IMPORT_IF_MISSING === '1';
const DASHBOARD_JSON_PATH = process.env.GRAFANA_DASH_JSON_PATH
  || 'ops/grafana/ml_suggestions_dashboard.json'; // customize if needed

test.describe.configure({ mode: 'serial', timeout: 90_000 });

async function grafana() {
  expect(GRAFANA_URL, 'GRAFANA_URL not set').toBeTruthy();
  expect(GRAFANA_API_KEY, 'GRAFANA_API_KEY not set').toBeTruthy();

  return await request.newContext({
    baseURL: GRAFANA_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${GRAFANA_API_KEY}` }
  });
}

test('Dashboard exists (or import) and has expected ML panels', async ({ page }, testInfo) => {
  test.skip(!GRAFANA_URL || !GRAFANA_API_KEY, 'Grafana env not set');

  const api = await grafana();

  // 1) Search dashboard
  const search = await api.get(`/api/search`, { params: { query: DASH_QUERY } });
  expect(search.ok(), `GET /api/search failed: ${search.status()} ${await search.text()}`).toBeTruthy();
  let results: any[] = await search.json();
  let dash = results.find(r => (r.title || '').trim() === DASH_QUERY.trim());

  // 2) Import if missing (optional)
  if (!dash && IMPORT_IF_MISSING) {
    const abs = path.resolve(DASHBOARD_JSON_PATH);
    if (!fs.existsSync(abs)) {
      test.skip(true, `Dashboard JSON not found at ${abs} and import requested`);
    }
    const payload = fs.readFileSync(abs, 'utf8');
    const imp = await api.post(`/api/dashboards/db`, {
      headers: { 'Content-Type': 'application/json' },
      data: payload,
    });
    expect(imp.ok(), `Import failed: ${imp.status()} ${await imp.text()}`).toBeTruthy();

    // search again
    const search2 = await api.get(`/api/search`, { params: { query: DASH_QUERY } });
    expect(search2.ok()).toBeTruthy();
    results = await search2.json();
    dash = results.find(r => (r.title || '').trim() === DASH_QUERY.trim());
  }

  test.skip(!dash, `Dashboard "${DASH_QUERY}" not found and no import performed`);

  // 3) Fetch dashboard by UID and assert core details
  const uid = dash.uid;
  const getDash = await api.get(`/api/dashboards/uid/${uid}`);
  expect(getDash.ok(), `GET /api/dashboards/uid/${uid} failed: ${getDash.status()} ${await getDash.text()}`).toBeTruthy();

  const dj = await getDash.json();
  testInfo.attach('dashboard.json', { contentType: 'application/json', body: JSON.stringify(dj, null, 2) });

  // Extract the actual dashboard payload
  const d = dj.dashboard || dj;
  expect(d.title).toBe(DASH_QUERY);

  // 4) Basic structure checks
  expect(Array.isArray(d.panels)).toBeTruthy();
  expect(d.templating?.list?.length >= 1).toBeTruthy();

  // 5) Ensure expected ML panels/queries exist
  const panelsText = JSON.stringify(d.panels);
  // key metrics used in our ML dashboard
  const required = [
    'lm_ml_train_val_f1_macro',
    'lm_ml_predict_requests_total',
    'lm_suggest_compare_total'
  ];
  required.forEach(key => {
    expect(panelsText.includes(key), `Dashboard panels missing "${key}"`).toBeTruthy();
  });

  // Optional: Confirm Prometheus datasource templating var exists
  const templ = d.templating.list.map((t: any) => (t.name || '').toLowerCase());
  expect(templ.includes('prom'), 'Prometheus datasource variable "$prom" not found').toBeTruthy();
});
