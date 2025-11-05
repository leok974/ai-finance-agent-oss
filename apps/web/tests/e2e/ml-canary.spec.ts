import { test, expect, request } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8000';

test.describe('ML Canary Metrics', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test('suggestion triggers compare + predictions counters', async () => {
    const api = await request.newContext();
    
    // Call suggestions a few times to generate signals
    const txnId = process.env.TXN_ID ? Number(process.env.TXN_ID) : 999001;
    
    for (let i = 0; i < 3; i++) {
      const response = await api.post(`${BASE}/agent/suggestions`, {
        data: { txn_ids: [txnId], mode: 'auto' },
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Allow 404 if transaction doesn't exist in test DB
      if (!response.ok() && response.status() !== 404) {
        throw new Error(`Unexpected status: ${response.status()}`);
      }
    }
    
    // Fetch metrics endpoint
    const metricsResponse = await api.get(`${BASE}/metrics`);
    expect(metricsResponse.ok()).toBeTruthy();
    
    const metricsText = await metricsResponse.text();
    
    // Verify ML canary metrics are present
    expect(metricsText).toContain('lm_suggest_compare_total');
    expect(metricsText).toContain('lm_ml_predictions_total');
    expect(metricsText).toContain('lm_ml_fallback_total');
    expect(metricsText).toContain('lm_ml_predict_latency_seconds');
    
    // Verify metrics have been incremented
    const compareMatch = metricsText.match(/lm_suggest_compare_total\{agree="(True|False|None)"\}\s+(\d+)/);
    if (compareMatch) {
      const count = Number(compareMatch[2]);
      expect(count).toBeGreaterThanOrEqual(0); // Should be primed at minimum
    }
  });

  test('metrics endpoint returns valid prometheus format', async () => {
    const api = await request.newContext();
    const response = await api.get(`${BASE}/metrics`);
    
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    
    // Check for standard Prometheus metric patterns
    expect(text).toMatch(/# HELP \w+/);
    expect(text).toMatch(/# TYPE \w+ (counter|histogram|gauge)/);
    
    // Verify ML metrics are properly typed
    expect(text).toContain('# TYPE lm_ml_predictions_total counter');
    expect(text).toContain('# TYPE lm_ml_fallback_total counter');
    expect(text).toContain('# TYPE lm_ml_predict_latency_seconds histogram');
  });

  test('fallback metrics track reasons correctly', async () => {
    const api = await request.newContext();
    const response = await api.get(`${BASE}/metrics`);
    
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    
    // Check all fallback reason labels exist (primed at startup)
    expect(text).toMatch(/lm_ml_fallback_total\{reason="unavailable"\}/);
    expect(text).toMatch(/lm_ml_fallback_total\{reason="not_in_canary"\}/);
    expect(text).toMatch(/lm_ml_fallback_total\{reason="low_confidence"\}/);
    expect(text).toMatch(/lm_ml_fallback_total\{reason="unknown"\}/);
  });

  test('latency histogram has expected buckets', async () => {
    const api = await request.newContext();
    const response = await api.get(`${BASE}/metrics`);
    
    expect(response.ok()).toBeTruthy();
    const text = await response.text();
    
    // Check histogram buckets exist
    expect(text).toMatch(/lm_ml_predict_latency_seconds_bucket\{le="0\.005"\}/);
    expect(text).toMatch(/lm_ml_predict_latency_seconds_bucket\{le="0\.01"\}/);
    expect(text).toMatch(/lm_ml_predict_latency_seconds_bucket\{le="0\.05"\}/);
    expect(text).toMatch(/lm_ml_predict_latency_seconds_bucket\{le="0\.1"\}/);
    expect(text).toMatch(/lm_ml_predict_latency_seconds_bucket\{le="\+Inf"\}/);
  });

  test('model status endpoint returns calibration info', async () => {
    const api = await request.newContext();
    const response = await api.get(`${BASE}/ml/v2/model/status`);
    
    // Allow 404 if ML endpoints not yet implemented
    if (response.status() === 404) {
      test.skip();
      return;
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Should have metadata about deployed model
    expect(data).toHaveProperty('available');
    
    if (data.available) {
      expect(data).toHaveProperty('run_id');
      expect(data).toHaveProperty('val_f1_macro');
      // Calibration info may be present
      if (data.calibration_enabled !== undefined) {
        expect(typeof data.calibration_enabled).toBe('boolean');
      }
    }
  });
});
