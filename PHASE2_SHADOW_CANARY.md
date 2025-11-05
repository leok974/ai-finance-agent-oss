# Phase 2 ML: Shadow Mode + Canary Deployment Integration

**Status**: ✅ COMPLETE  
**Date**: 2025-11-04

## Overview

This document describes the Phase 2 ML integration that adds **shadow mode** and **canary deployment** capabilities to the suggestions pipeline. The system now runs both rule-based and ML model predictions in parallel, tracks agreement metrics, and supports gradual rollout of model predictions to users.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Suggestions Request                       │
│                      (transaction)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   suggest_auto()            │
         │   (serve.py)                │
         └──────────┬──────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────┐      ┌──────────────────┐
│ Rule Engine  │      │  ML Model        │
│ (heuristics) │      │  (LightGBM)      │
│              │      │  via runtime.py  │
└──────┬───────┘      └──────┬───────────┘
       │                     │
       │                     │
       ▼                     ▼
┌──────────────────────────────────────┐
│  Agreement Metric                    │
│  suggest_compare_total{agree}        │
└──────────────────────────────────────┘
                    │
        ┌───────────┴─────────────┐
        │  CANARY SWITCH          │
        │  (env: SUGGEST_USE_     │
        │   MODEL_CANARY)         │
        └───────────┬─────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   ┌─────────┐           ┌──────────┐
   │ Rules   │           │  Model   │
   │ (live)  │           │ (canary) │
   └─────────┘           └──────────┘
```

## Components Modified

### 1. `apps/backend/app/services/suggest/serve.py`

**Changes**:
- Added imports: `ml_predict_requests_total`, `suggest_compare_total`, `suggest_source_total`, `ml_predict_row`, `normalize_description`
- Added `_sticky_hash()` function for consistent user-based rollout
- **Updated `suggest_auto()` signature**: Now accepts `user_id: Optional[str]` parameter
- **Shadow mode logic**: Always runs model prediction alongside rules, tracks agreement
- **Canary logic**: Reads `SUGGEST_USE_MODEL_CANARY` env var to control rollout

**Key Features**:
```python
def suggest_auto(txn: Dict, user_id: Optional[str] = None):
    # 1) PRIMARY = RULES
    rule_cands = suggest_for_txn(txn)
    
    # 2) SHADOW = MODEL (always runs for metrics)
    model_result = ml_predict_row(model_features)
    
    # 3) AGREEMENT METRIC
    if model_result.get("available") and rule_label:
        agree = (model_result["label"] == rule_label)
        suggest_compare_total.labels(agree=str(agree)).inc()
    
    # 4) CANARY SWITCH
    if use_model and model_result.get("available"):
        return model_candidates  # Model predictions
    
    return rule_cands  # Rules (default)
```

### 2. `apps/backend/app/routers/suggestions.py`

**Changes**:
- Updated `suggest()` endpoint to extract `user_id` from transaction context
- Passes `user_id` to `suggest_auto()` for sticky canary rollout

**Code**:
```python
user_id = str(txn.get("tenant_id", "default"))
cands, model_id, features_hash, source = suggest_auto(txn, user_id=user_id)
```

### 3. `apps/web/tests/ml-smoke.spec.ts` (NEW)

**Playwright smoke tests** for ML pipeline:
- **Test 1**: ML status → train (tolerates no-data) → status
- **Test 2**: Suggestions endpoint emits compare metric
- **Test 3**: Prediction endpoint returns model or no_model

**Usage**:
```bash
cd apps/web
pnpm test:ml-smoke
```

### 4. `prometheus/rules/ml_alerts.yml` (UPDATED)

**New alert added**:
```yaml
- alert: SuggestAgreementDrop
  expr: (sum(rate(lm_suggest_compare_total{agree="True"}[1h])) / clamp_min(sum(rate(lm_suggest_compare_total[1h])), 1e-9)) < 0.75
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "Rule ↔ model agreement below 75%"
```

## Environment Variables

### `SUGGEST_USE_MODEL_CANARY`

Controls canary rollout of model predictions:

| Value | Behavior |
|-------|----------|
| `0` (default) | Always use rules (shadow mode only) |
| `1` | Always use model (100% rollout) |
| `10%` | 10% of users get model predictions (sticky by user_id) |
| `50%` | 50% rollout |
| `100%` | 100% rollout (equivalent to `1`) |

**Setting the variable**:
```bash
# Docker Compose
export SUGGEST_USE_MODEL_CANARY=10%
docker compose -f docker-compose.prod.yml up -d backend

# Kubernetes
kubectl set env deployment/backend SUGGEST_USE_MODEL_CANARY=10%
```

## Metrics

### New Prometheus Metrics

1. **`lm_ml_predict_requests_total{available}`**  
   - Tracks all ML prediction requests
   - Labels: `available="True"` or `available="False"`

2. **`lm_suggest_compare_total{agree}`**  
   - Tracks rule vs model agreement in shadow mode
   - Labels: `agree="True"`, `agree="False"`, or `agree="None"`

3. **`lm_suggest_source_total{source}`**  
   - Tracks actual suggestions returned to users
   - Labels: `source="rule"` or `source="model"`

### Grafana Dashboard Panels

The existing `ml-suggestions.json` dashboard includes:

1. **Agreement Rate (Gauge)**: Shows rule ↔ model agreement over 30m
2. **Suggestions by Source (Timeseries)**: Rule vs model usage
3. **Model Availability (Stat)**: Percentage of predictions with available model

## Rollout Workflow

### Phase 0: Shadow Mode (Current Default)

```bash
# Ensure env var is 0 or unset
export SUGGEST_USE_MODEL_CANARY=0

# Restart backend
docker compose -f docker-compose.prod.yml restart backend

# Monitor agreement metrics
curl -s http://localhost:8000/metrics | grep lm_suggest_compare_total
```

**Expected behavior**:
- All users get rule-based suggestions
- Model predictions computed silently in background
- Agreement metric tracked for analysis
- `lm_suggest_source_total{source="rule"}` increments
- `lm_suggest_compare_total{agree="True"/"False"}` tracks alignment

### Phase 1: 10% Canary

```bash
# Enable 10% rollout
export SUGGEST_USE_MODEL_CANARY=10%
docker compose -f docker-compose.prod.yml restart backend

# Monitor metrics
curl -s http://localhost:8000/metrics | grep lm_suggest_source_total
```

**Expected behavior**:
- 10% of users (sticky by user_id hash) get model predictions
- 90% still get rules
- Agreement still tracked for shadow 90%
- Both `source="rule"` and `source="model"` increment

**Verification**:
```bash
# Check source distribution (should be ~90/10 ratio)
curl -s http://localhost:8000/metrics | \
  grep 'lm_suggest_source_total' | \
  awk '{print $1, $2}'
```

### Phase 2: 50% Canary

```bash
export SUGGEST_USE_MODEL_CANARY=50%
docker compose -f docker-compose.prod.yml restart backend
```

### Phase 3: 100% Model

```bash
export SUGGEST_USE_MODEL_CANARY=1
# or
export SUGGEST_USE_MODEL_CANARY=100%
docker compose -f docker-compose.prod.yml restart backend
```

**Expected behavior**:
- All users get model predictions (if model available)
- Rules used as fallback if model unavailable
- `lm_suggest_source_total{source="model"}` dominates

## Testing

### Quick Verification

```bash
# 1) Check model status
curl http://localhost:8000/ml/v2/model/status | jq

# 2) Get suggestions (should work with any txn_id)
curl -X POST http://localhost:8000/ml/suggestions \
  -H 'Content-Type: application/json' \
  -d '{"txn_ids": [88], "mode": "auto"}' | jq

# 3) Check metrics
curl -s http://localhost:8000/metrics | grep -E "lm_ml_|lm_suggest_"
```

### Playwright Smoke Tests

```bash
cd apps/web
pnpm test:ml-smoke
```

**Test output** (expected):
```
✓ ML pipeline: status → train(no-data tolerant) → status
✓ Suggestions endpoint emits compare metric after one call
✓ Prediction endpoint returns model or no_model
```

### Makefile Targets

```bash
# Build features
make ml-features

# Train model
make ml-train

# Check status
make ml-status

# Predict sample
make ml-predict

# Full smoke test
make ml-smoke
```

## Troubleshooting

### Issue: Metrics not visible in `/metrics`

**Symptoms**:
```bash
curl -s http://localhost:8000/metrics | grep lm_suggest_compare_total
# No output
```

**Cause**: Metrics created with labels but never incremented (Prometheus requires at least one sample)

**Solution**: Metrics are primed with `.inc(0)` in `metrics_ml.py`. Restart backend:
```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Issue: Model always unavailable

**Symptoms**:
```bash
curl http://localhost:8000/ml/v2/model/status | jq
# {"available": false}
```

**Cause**: No model trained yet or deployment failed

**Solution**:
```bash
# Check if labeled data exists
docker compose exec postgres psql -U myuser -d finance \
  -c "SELECT COUNT(*) FROM transaction_labels"

# If count > 100, train model
make ml-train

# Check deployment
make ml-status
```

### Issue: Agreement rate always 0%

**Symptoms**: Grafana panel shows 0% agreement

**Cause**: No traffic hitting suggestions endpoint or model unavailable

**Solution**:
```bash
# Generate traffic
curl -X POST http://localhost:8000/ml/suggestions \
  -H 'Content-Type: application/json' \
  -d '{"txn_ids": [88, 89, 90]}' | jq

# Check metric incremented
curl -s http://localhost:8000/metrics | grep lm_suggest_compare_total
```

### Issue: Canary not sticking per user

**Symptoms**: Same user gets different suggestions (rule vs model) on repeated requests

**Cause**: `user_id` not consistent across requests

**Solution**: Check that `user_id` extraction in `suggestions.py` is deterministic:
```python
# In suggest() endpoint:
user_id = str(txn.get("tenant_id", "default"))
```

If `tenant_id` is null, all requests hash to "default". Consider using request headers or session data for better user identification.

## Grafana Queries

### Agreement Rate (30-minute window)

```promql
sum(rate(lm_suggest_compare_total{agree="True"}[30m])) / 
clamp_min(sum(rate(lm_suggest_compare_total[30m])), 1e-9)
```

### Source Distribution

```promql
sum by (source) (rate(lm_suggest_source_total[5m]))
```

### Model Availability

```promql
sum(rate(lm_ml_predict_requests_total{available="True"}[5m])) /
clamp_min(sum(rate(lm_ml_predict_requests_total[5m])), 1e-9)
```

## Next Steps

### Immediate (After Deployment)

1. **Monitor shadow mode for 48h**:
   - Track agreement rate in Grafana
   - Investigate low agreement (<75%) transactions
   - Collect user feedback on rule suggestions

2. **Verify model quality**:
   - Check F1 score: `make ml-status`
   - If F1 < 0.72, retrain with more data
   - Review misclassified transactions

3. **Prepare for canary**:
   - Identify beta user cohort (e.g., internal users)
   - Document rollback procedure
   - Set up alerts for agreement drop

### Short-term (Week 1-2)

1. **10% canary rollout**:
   - Set `SUGGEST_USE_MODEL_CANARY=10%`
   - Monitor for 3-7 days
   - Compare user satisfaction (accept rate) between cohorts

2. **A/B testing** (optional):
   - Log suggestion events with source tag
   - Analyze accept/reject rates by source
   - Statistical significance testing

3. **Incremental rollout**:
   - If metrics healthy, increase to 25% → 50% → 100%
   - Each step: monitor 2-3 days before proceeding

### Long-term (Month 1+)

1. **Model retraining schedule**:
   - Set up nightly CI/CD: `.github/workflows/ml.yml`
   - Auto-deploy if F1 improves by 2%
   - Keep last 3 models in registry

2. **Drift detection**:
   - Track agreement rate over time
   - Alert if drops >10% from baseline
   - Trigger retraining on drift

3. **Feature engineering improvements**:
   - Add merchant embeddings
   - Time-of-day patterns
   - User-specific history features

4. **Feedback loop**:
   - Use accept/reject actions as training labels
   - Retrain weekly with user feedback
   - Close the loop: suggestions → feedback → training

## References

- **Phase 2 ML Pipeline Docs**: `PHASE2_ML_PIPELINE.md`
- **Implementation Checklist**: `PHASE2_IMPLEMENTATION_COMPLETE.md`
- **Grafana Dashboard**: `ops/grafana/dashboards/ml-suggestions.json`
- **Prometheus Alerts**: `prometheus/rules/ml_alerts.yml`
- **Makefile Targets**: Search for `ml-` prefix in `Makefile`

## File Manifest

**Modified**:
- `apps/backend/app/services/suggest/serve.py` - Shadow + canary logic
- `apps/backend/app/routers/suggestions.py` - user_id extraction
- `prometheus/rules/ml_alerts.yml` - Agreement drop alert

**Created**:
- `apps/web/tests/ml-smoke.spec.ts` - Playwright E2E tests
- `PHASE2_SHADOW_CANARY.md` - This document

**Already Exists** (from Phase 2):
- `apps/backend/app/ml/runtime.py` - Model serving
- `apps/backend/app/metrics_ml.py` - ML Prometheus metrics
- `apps/backend/app/routers/ml_v2.py` - Training/prediction API
- `ops/grafana/dashboards/ml-suggestions.json` - Monitoring dashboard

---

**Deployment Checklist**:

- [x] Shadow mode integrated in `serve.py`
- [x] Metrics tracked (`compare_total`, `source_total`, `predict_requests_total`)
- [x] Canary environment variable supported (`SUGGEST_USE_MODEL_CANARY`)
- [x] Grafana dashboard updated with agreement panels
- [x] Prometheus alerts configured (agreement drop)
- [x] Playwright smoke tests created
- [x] Documentation complete
- [ ] Deploy to staging
- [ ] Monitor shadow mode for 48h
- [ ] Begin 10% canary rollout
- [ ] A/B analysis and incremental rollout
