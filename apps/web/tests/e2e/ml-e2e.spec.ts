import { test, expect, request, type APIRequestContext } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8000';
const ML_TRAIN_LIMIT = Number(process.env.ML_TRAIN_LIMIT || 20000);

async function getJSON(api: APIRequestContext, path: string) {
  const r = await api.get(`${BASE}${path}`);
  expect(r.ok(), `GET ${path} failed: ${r.status()} ${await r.text()}`).toBeTruthy();
  return r.json();
}

async function postJSON(api: APIRequestContext, path: string, body?: any) {
  const r = await api.post(`${BASE}${path}`, { data: body });
  return r;
}

test.describe.configure({ mode: 'serial' });

test('ml status → optional train → status (no-data tolerant)', async () => {
  const api = await request.newContext();

  // 0) backend health (fast fail)
  const ready = await api.get(`${BASE}/ready`);
  expect(ready.ok(), `/ready failed: ${ready.status()}`).toBeTruthy();

  // 1) model status
  const s1 = await api.get(`${BASE}/ml/v2/model/status`);
  expect(s1.ok(), '/ml/v2/model/status failed').toBeTruthy();
  const s1j = await s1.json();
  test.info().attach('status-before.json', { contentType: 'application/json', body: JSON.stringify(s1j, null, 2) });

  // 2) try training (it may 400 with "no_data")
  const t = await api.post(`${BASE}/ml/v2/train?limit=${ML_TRAIN_LIMIT}`);
  const okOrNoData = t.status() === 200 || t.status() === 400;
  expect(okOrNoData, `train status=${t.status()} body=${await t.text()}`).toBeTruthy();

  // 3) model status again
  const s2 = await api.get(`${BASE}/ml/v2/model/status`);
  expect(s2.ok()).toBeTruthy();
  const s2j = await s2.json();
  test.info().attach('status-after.json', { contentType: 'application/json', body: JSON.stringify(s2j, null, 2) });
});

test('suggestions path emits compare metrics after a request', async () => {
  const api = await request.newContext();

  // A known txn_id should exist in your dev/prod seed (999001 was used in prior scripts)
  const body = { txn_id: Number(process.env.TXN_ID || 999001) };
  const sug = await postJSON(api, '/agent/suggestions', body);

  // If suggestions endpoint is auth-guarded in prod, you can skip
  if (!sug.ok()) {
    test.skip(true, `suggestions not available: ${sug.status()} ${await sug.text()}`);
  }

  // Metrics exist & include our prefixes (don't assert counts; just presence)
  const m = await api.get(`${BASE}/metrics`);
  expect(m.ok(), '/metrics fails').toBeTruthy();
  const text = await m.text();
  expect(text).toContain('lm_ml_');            // model metrics
  expect(text).toContain('lm_suggest_compare'); // rule↔model compare
});

test('predict endpoint (raw row) returns structured output', async () => {
  const api = await request.newContext();

  const row = {
    abs_amount: 42.5,
    merchant: "HARRIS TEETER",
    channel: "pos",
    hour_of_day: 18,
    dow: 5,
    is_weekend: true,
    is_subscription: false,
    norm_desc: "HARRIS TEETER 0085"
  };

  const r = await api.post(`${BASE}/ml/v2/predict`, { data: row });
  expect(r.ok(), `/ml/v2/predict failed: ${r.status()} ${await r.text()}`).toBeTruthy();
  const j = await r.json();
  expect(j).toHaveProperty('available');
  if (j.available) {
    expect(j).toHaveProperty('label');
    expect(typeof j.confidence).toBe('number');
  }
});
