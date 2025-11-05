import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * Grafana ML E2E Tests
 * 
 * Required:
 *   BASE_URL:        http://localhost:8000 (backend)
 *
 * Optional (if set, we validate Grafana too):
 *   GRAFANA_URL:     https://grafana.example.com
 *   GRAFANA_API_KEY: Grafana PAT with at least Viewer + API access
 *   GRAFANA_JSON_DS_NAME: name of JSON API datasource (default: "ApplyLens API" or first found of type simpod-json-datasource)
 *   GRAFANA_PROM_DS_NAME: name of Prometheus datasource (default: first found of type prometheus)
 */

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const GRAFANA_URL = process.env.GRAFANA_URL;
const GRAFANA_API_KEY = process.env.GRAFANA_API_KEY;

async function backend(api: APIRequestContext, path: string, method: 'GET'|'POST'='GET', data?: any) {
  const url = `${BASE}${path}`;
  const r = method === 'GET' ? await api.get(url) : await api.post(url, { data });
  expect(r.ok(), `${method} ${path} failed: ${r.status()} ${await r.text()}`).toBeTruthy();
  return r;
}

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test('Warm traffic → verify backend /metrics has lm_ml_*', async () => {
  const api = await request.newContext();

  // 0) health
  await backend(api, '/ready');

  // 1) hit predict a couple of times (whether model exists or not)
  for (let i = 0; i < 3; i++) {
    await backend(api, '/ml/v2/predict', 'POST', {
      abs_amount: 12.34 + i,
      merchant: 'HARRIS TEETER',
      channel: 'pos',
      hour_of_day: 18,
      dow: 5,
      is_weekend: true,
      is_subscription: false,
      norm_desc: 'HARRIS TEETER 0085'
    });
  }

  // 2) hit suggestions once to trigger compare metric (even if model unavailable)
  await api.post(`${BASE}/agent/suggestions`, { data: { txn_id: Number(process.env.TXN_ID || 999001) } }).catch(() => {});

  // 3) assert metrics presence
  const m = await backend(api, '/metrics');
  const txt = await m.text();
  expect(txt).toContain('lm_ml_predict_requests_total');
  // presence only; counts may be zero in fresh envs:
  expect(txt).toContain('lm_ml_');
  // compare counter shows up after suggestions call (may be zero if endpoint skipped)
  expect(txt).toContain('lm_suggest_compare_total');
});

test('Grafana JSON API proxy to /ml/model/status (optional)', async () => {
  test.skip(!GRAFANA_URL || !GRAFANA_API_KEY, 'Grafana env not set');

  const api = await request.newContext({
    baseURL: GRAFANA_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${GRAFANA_API_KEY}` }
  });

  // 1) list datasources
  const ds = await api.get('/api/datasources');
  expect(ds.ok(), 'GET /api/datasources failed').toBeTruthy();
  const list = await ds.json();

  // 2) pick JSON API datasource
  let jsonDs = list.find((d: any) => d.type === 'simpod-json-datasource');
  const prefer = process.env.GRAFANA_JSON_DS_NAME;
  if (prefer) {
    const byName = list.find((d: any) => d.name === prefer);
    if (byName && byName.type === 'simpod-json-datasource') jsonDs = byName;
  }
  test.skip(!jsonDs, 'No simpod-json-datasource found');

  // 3) call backend through Grafana proxy
  const prox = await api.get(`/api/datasources/proxy/${jsonDs.id}/ml/model/status`);
  expect(prox.ok(), `Proxy to JSON API datasource failed: ${prox.status()} ${await prox.text()}`).toBeTruthy();
  const j = await prox.json();
  // structure check
  expect(j).toHaveProperty('available');
  expect(j).toHaveProperty('meta');
});

test('Grafana Prometheus query for lm_ml_* (optional)', async () => {
  test.skip(!GRAFANA_URL || !GRAFANA_API_KEY, 'Grafana env not set');

  const api = await request.newContext({
    baseURL: GRAFANA_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${GRAFANA_API_KEY}` }
  });

  // 1) pick Prometheus datasource
  const ds = await api.get('/api/datasources');
  expect(ds.ok()).toBeTruthy();
  const list = await ds.json();

  let promDs = list.find((d: any) => d.type === 'prometheus');
  const prefer = process.env.GRAFANA_PROM_DS_NAME;
  if (prefer) {
    const byName = list.find((d: any) => d.name === prefer);
    if (byName && byName.type === 'prometheus') promDs = byName;
  }
  test.skip(!promDs, 'No Prometheus datasource found');

  // 2) query via Grafana proxy to Prometheus:
  // Use Prometheus HTTP API through Grafana: /api/datasources/proxy/:id/api/v1/query
  const q = 'lm_ml_predict_requests_total';
  const r = await api.get(`/api/datasources/proxy/${promDs.id}/api/v1/query`, {
    params: { query: q }
  });
  expect(r.ok(), `Prom proxy query failed: ${r.status()} ${await r.text()}`).toBeTruthy();
  const jr = await r.json();
  expect(jr).toHaveProperty('status');
  expect(['success', 'error']).toContain(jr.status);
  // don't require series — fresh envs may not have samples yet
});
