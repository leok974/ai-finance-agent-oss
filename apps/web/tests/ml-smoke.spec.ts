/**
 * ML Pipeline Smoke Tests
 * 
 * Validates ML training and prediction endpoints with tolerance for no-data scenarios.
 * Tests both API functionality and metrics integration.
 */
import { test, expect, request } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8000';

test('ML pipeline: status → train(no-data tolerant) → status', async () => {
  const api = await request.newContext();
  
  // 1) Check model status (should always succeed)
  const s1 = await api.get(`${BASE}/ml/v2/model/status`);
  expect(s1.ok()).toBeTruthy();
  const status1 = await s1.json();
  console.log('Initial model status:', status1);

  // 2) Kick off training (may 400 when no data; allow either)
  const t = await api.post(`${BASE}/ml/v2/train?limit=5000`);
  expect([200, 400]).toContain(t.status()); // ok or no_data
  
  if (t.status() === 200) {
    const trainResult = await t.json();
    console.log('Training result:', trainResult);
  } else {
    console.log('Training skipped: no labeled data (expected in fresh setup)');
  }

  // 3) Check status again (should reflect training if it ran)
  const s2 = await api.get(`${BASE}/ml/v2/model/status`);
  expect(s2.ok()).toBeTruthy();
  const status2 = await s2.json();
  console.log('Post-training model status:', status2);
});

test('Suggestions endpoint emits compare metric after one call', async () => {
  const api = await request.newContext();
  
  // Hit any txn you know exists; fallback to dummy ID
  // This tests shadow mode integration (model predictions run but rules returned)
  const resp = await api.post(`${BASE}/ml/suggestions`, {
    data: { 
      txn_ids: [999001]  // Use a known test transaction or accept 404
    }
  });
  
  // Accept both success (txn found) or empty results (txn not found)
  // The key is that the endpoint doesn't crash
  expect([200, 404]).toContain(resp.status());
  
  if (resp.ok()) {
    const result = await resp.json();
    console.log('Suggestions result:', result);
  }
  
  // Metrics should be reachable (don't assert values; just the endpoint)
  const m = await api.get(`${BASE}/metrics`);
  expect(m.ok()).toBeTruthy();
  
  // Verify ML metrics are present (at least primed to zero)
  const metricsText = await m.text();
  expect(metricsText).toContain('lm_ml_predict_requests_total');
  expect(metricsText).toContain('lm_suggest_source_total');
  console.log('✓ ML metrics are exposed');
});

test('Prediction endpoint returns model or no_model', async () => {
  const api = await request.newContext();
  
  // Test prediction with sample features
  const sampleFeatures = {
    abs_amount: 42.5,
    merchant: 'HARRIS TEETER',
    channel: 'pos',
    hour_of_day: 18,
    dow: 5,
    is_weekend: true,
    is_subscription: false,
    norm_desc: 'HARRIS TEETER #0085 12960 HIGHLAND CROS'
  };
  
  const p = await api.post(`${BASE}/ml/v2/predict`, {
    data: sampleFeatures
  });
  
  expect(p.ok()).toBeTruthy();
  const prediction = await p.json();
  
  // Should always have 'available' field
  expect(prediction).toHaveProperty('available');
  
  if (prediction.available) {
    // If model is loaded, should have label and confidence
    expect(prediction).toHaveProperty('label');
    expect(prediction).toHaveProperty('confidence');
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
    console.log(`✓ Model predicted: ${prediction.label} (conf=${prediction.confidence.toFixed(2)})`);
  } else {
    // If model not available, should have reason
    expect(prediction).toHaveProperty('reason');
    console.log(`✓ Model unavailable: ${prediction.reason}`);
  }
});
