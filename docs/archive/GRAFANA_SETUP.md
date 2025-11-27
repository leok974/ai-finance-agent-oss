# Grafana Dashboard Setup for ML Pipeline Phase 2.1

## ✅ Metrics Validation Complete

Prometheus instrumentation verified working:
- **Accept metric**: `lm_ml_suggestion_accepts_total{label="Shopping",model_version="merchant-majority@v1",source="rule"}` = 1.0
- **Idempotency**: Re-accepting the same suggestion does NOT double-count (counter remains 1.0)
- **Endpoint**: `GET http://localhost:8000/metrics` (Prometheus exposition format)

## Dashboard Creation

Open Grafana → Create new dashboard → Name: **"ML Pipeline Phase 2.1"**

### Panel 1: Accept Rate (24h) - Stat Panel

**Query:**
```promql
sum(increase(lm_ml_suggestion_accepts_total[24h]))
/ clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)
```

**Settings:**
- Visualization: **Stat**
- Unit: **Percent (0.0-1.0)**
- Thresholds:
  - 🔴 Red: `< 0.30` (Low acceptance)
  - 🟡 Yellow: `0.30 - 0.50` (Moderate)
  - 🟢 Green: `> 0.50` (High acceptance)
- Title: **Accept Rate (24h)**
- Description: *Percentage of suggestions accepted by users in the last 24 hours*

---

### Panel 2: Top Accepts by Model/Label - Table Panel

**Query:**
```promql
sum by (model_version, label) (increase(lm_ml_suggestion_accepts_total[24h]))
```

**Settings:**
- Visualization: **Table**
- Sort: **Value (Descending)**
- Limit: **10 rows**
- Title: **Top Accepts by Model/Label**
- Description: *Most accepted suggestion categories in the last 24 hours*
- Column Aliases:
  - `model_version` → **Model Version**
  - `label` → **Label**
  - `Value` → **Accepts (24h)**

---

### Panel 3: Ask-Agent Rate (Low Confidence) - Stat Panel

**Query:**
```promql
sum(increase(lm_ml_predict_requests_total{mode="ask"}[24h]))
/ clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)
```

**Settings:**
- Visualization: **Stat**
- Unit: **Percent (0.0-1.0)**
- Thresholds:
  - 🟢 Green: `< 0.30` (Low fallback rate)
  - 🟡 Yellow: `0.30 - 0.50` (Moderate)
  - 🔴 Red: `> 0.50` (High fallback - model not confident)
- Title: **Ask-Agent Rate (Low Confidence)**
- Description: *Percentage of predictions where confidence was too low (model fell back to asking agent)*

---

### Panel 4: Canary Coverage - Stat Panel

**Query:**
```promql
sum(increase(lm_ml_predict_requests_total{mode="canary"}[24h]))
/ clamp_max(sum(increase(lm_ml_predict_requests_total[24h])), 1)
```

**Settings:**
- Visualization: **Stat**
- Unit: **Percent (0.0-1.0)**
- Thresholds:
  - 🟢 Green: Match `SUGGEST_USE_MODEL_CANARY` setting (e.g., 0.10 for 10%)
  - 🟡 Yellow: Within ±5% of target
  - 🔴 Red: Significantly off target
- Title: **Canary Coverage**
- Description: *Percentage of predictions using canary model (should match SUGGEST_USE_MODEL_CANARY setting)*

---

## Additional Metrics (Optional Panels)

### Suggestion Latency (p99)
```promql
histogram_quantile(0.99, sum(rate(lm_ml_predict_latency_seconds_bucket[5m])) by (le))
```
**Threshold**: 🟢 Green < 500ms, 🟡 Yellow 500ms-1s, 🔴 Red > 1s

### Merchant Majority Hits
```promql
sum by (merchant_label) (increase(lm_ml_merchant_majority_hits_total[24h]))
```

### Shadow Mode Agreement (if enabled)
```promql
sum by (agree) (increase(lm_suggest_compare_total[24h]))
```

---

## Validation Checklist

Before enabling canary:

- [ ] All 4 panels displaying data
- [ ] Accept rate baseline established (typically 30-60% for new models)
- [ ] Ask-agent rate < 50% (model is confident enough)
- [ ] p99 latency < 500ms (no performance regression)
- [ ] No errors in backend logs: `docker logs backend 2>&1 | grep ERROR`

---

## Next Steps: 10% Canary Rollout

Once Grafana dashboard is validated, start 10% canary:

### Option A: Docker Compose (Production)
```bash
make canary-10
# Or manually:
# docker compose -f ops/docker-compose.prod.yml exec backend sh -c 'export SUGGEST_USE_MODEL_CANARY=10 && ...'
```

### Option B: Local Backend (Development)
```powershell
# Stop current backend (Ctrl+C)

# Set environment variable
$env:SUGGEST_USE_MODEL_CANARY = "10"

# Restart backend
cd apps/backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Verify Canary Setting
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/ml/status"
# Should show: { "canary": "10", ... }
```

---

## Monitoring Schedule

### First 24 Hours (Hourly checks):
- Accept rate trends
- Error rate < 1%
- Latency p99 < 500ms
- No user complaints

### Days 2-7 (Daily checks):
- Accept rate ≥ 30%
- Ask-agent rate < 50%
- Canary coverage ~10% (Panel 4)

### Week 2 (Ramp to 50%):
If metrics are stable:
```bash
make canary-50
# Monitor for 3-5 days
```

### Week 3+ (Ramp to 100%):
If 50% canary is stable:
```bash
make canary-100
# Monitor for 1 week before declaring success
```

---

## Rollback Plan

If any of these occur, rollback to 0% immediately:

1. **Accept rate drops > 15%** compared to baseline
2. **Error rate > 1%** (check logs)
3. **p99 latency > 1s** (performance regression)
4. **User reports** of incorrect suggestions
5. **Ask-agent rate > 60%** (model too uncertain)

### Rollback Command
```bash
make canary-0
# Or:
# docker compose -f ops/docker-compose.prod.yml exec backend sh -c 'export SUGGEST_USE_MODEL_CANARY=0 && ...'
```

---

## Metric Definitions

| Metric | Description | Good Range |
|--------|-------------|-----------|
| **Accept Rate** | % of suggestions users accept | 30-60% |
| **Ask-Agent Rate** | % of predictions with low confidence | < 50% |
| **Canary Coverage** | % of predictions using model | Match setting (10/50/100%) |
| **p99 Latency** | 99th percentile prediction time | < 500ms |
| **Error Rate** | % of failed predictions | < 1% |

---

## Prometheus Scrape Configuration

Ensure Prometheus is scraping the backend `/metrics` endpoint:

```yaml
# ops/prometheus.yml
scrape_configs:
  - job_name: 'ledgermind-backend'
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/metrics'
```

Verify scraping:
```bash
curl http://localhost:9090/api/v1/targets
# Backend target should show state: "up"
```

---

## Dashboard Export

After creating the dashboard, export it:
1. Grafana UI → Dashboard Settings → JSON Model
2. Save to `ops/grafana/dashboards/ml-pipeline-phase-2.1.json`
3. Commit to repo for version control

---

## Questions?

- **No accept metric showing?** Check backend logs: `docker logs backend 2>&1 | grep lm_ml_suggestion_accepts`
- **Canary coverage always 0?** Model not loaded or `SUGGEST_USE_MODEL_CANARY=0`
- **High ask-agent rate?** Model confidence threshold may be too high (check `SUGGEST_CONFIDENCE_THRESHOLD`)
