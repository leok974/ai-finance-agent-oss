# ML Canary Quick Reference

Complete implementation of ML canary deployment with calibration, per-class thresholds, and comprehensive observability.

## 📁 Files Created/Modified

### Core Implementation
- ✅ `apps/backend/app/config.py` - ML controls (shadow, canary, thresholds, calibration)
- ✅ `apps/backend/app/metrics_ml.py` - 6 Prometheus metrics
- ✅ `apps/backend/app/services/suggest/serve.py` - Canary logic + thresholds
- ✅ `apps/backend/app/ml/train.py` - Isotonic calibration + acceptance gate
- ✅ `apps/backend/app/ml/model.py` - Calibration serving

### Testing
- ✅ `apps/backend/tests/test_ml_canary_thresholds.py` - 6 unit tests for canary behavior
- ✅ `apps/backend/tests/test_ml_calibration.py` - 6 unit tests for calibration
- ✅ `apps/web/tests/e2e/ml-canary.spec.ts` - 5 E2E tests for metrics

### Observability
- ✅ `ops/grafana/dashboards/ml-canary-overview.json` - Grafana dashboard (7 panels)
- ✅ `prometheus/rules/ml_phase3.yml` - 5 Prometheus alerts

### Documentation
- ✅ `ML_CANARY_DEPLOYMENT.md` - Complete deployment runbook (400+ lines)
- ✅ `apps/backend/.env.example` - Environment variable documentation
- ✅ `Makefile` - 9 convenience targets

## 🚀 Quick Start Commands

```bash
# 1. Configuration check
make ml-thresholds
# Output: {"shadow": true, "canary": "0", "thresholds": {...}, "calibration": true}

# 2. Train model with calibration + acceptance gate
make ml-train
# Output: {"run_id": "...", "val_f1_macro": 0.78, "passed_acceptance_gate": true}

# 3. Verify deployment
make ml-status
# Output: {"available": true, "run_id": "...", "calibration_enabled": true}

# 4. Run unit tests
make ml-tests
# Runs 12 pytest tests (thresholds + calibration)

# 5. Full smoke test
make ml-smoke
# Builds features → trains → predicts → checks metrics

# 6. Import Grafana dashboard
export GRAFANA_URL="http://localhost:3000"
export GRAFANA_API_KEY="your-api-key"
make ml-dash-import

# 7. Check metrics
curl http://localhost:8000/metrics | grep lm_ml
```

## 📊 Metrics Reference

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `lm_ml_predictions_total` | Counter | `accepted` | Model usage (True=model, False=rules) |
| `lm_ml_fallback_total` | Counter | `reason` | Why model wasn't used |
| `lm_ml_predict_latency_seconds` | Histogram | - | Prediction latency tracking |
| `lm_suggest_compare_total` | Counter | `agree` | Shadow comparison results |
| `ml_predict_requests_total` | Counter | `available` | Model availability |
| `suggest_source_total` | Counter | `source` | Suggestion source breakdown |

## 🎯 Prometheus Alerts

1. **MLHighDisagreement**: >25% rule-vs-model mismatch (15m)
2. **MLLowCoverage**: <60% model acceptance (20m)
3. **MLPredictLatencyHigh**: p95 > 150ms (10m)
4. **MLFallbackSpike**: >40% fallback rate (10m)
5. **MLModelUnavailable**: >10% unavailable (5m)

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Shadow mode (always predict for comparison)
SUGGEST_ENABLE_SHADOW=1

# Canary rollout: "0", "10%", "50%", "100"
SUGGEST_USE_MODEL_CANARY=0

# Per-class confidence thresholds
SUGGEST_THRESHOLDS_JSON={"Groceries":0.70,"Dining":0.75,"Shopping":0.65,"Transport":0.65,"Subscriptions":0.70,"Entertainment":0.60}

# Isotonic calibration toggle
ML_CALIBRATION_ENABLED=1

# Training acceptance gates
ML_DEPLOY_THRESHOLD_F1=0.72        # Macro F1
ML_DEPLOY_THRESHOLD_F1_MIN=0.60    # Per-class minimum
```

## 🎬 Phased Rollout Plan

### Week 1: Shadow Mode (0%)
```bash
SUGGEST_ENABLE_SHADOW=1
SUGGEST_USE_MODEL_CANARY=0
```
**Goal**: Collect comparison metrics without user impact  
**Metrics**: Monitor `lm_suggest_compare_total{agree="True"}` ratio

### Week 2: 10% Canary
```bash
SUGGEST_USE_MODEL_CANARY=10%
```
**Goal**: Test with small subset  
**Success**: No user complaints, latency < 100ms

### Week 3: 50% Canary
```bash
SUGGEST_USE_MODEL_CANARY=50%
```
**Goal**: Scale to half of users  
**Success**: Stable metrics, positive feedback

### Week 4: 100% Rollout
```bash
SUGGEST_USE_MODEL_CANARY=100
```
**Goal**: Full production deployment  
**Success**: >80% model acceptance

## 🧪 Testing

### Unit Tests (12 tests)
```bash
make ml-tests
```
- 6 tests: Threshold behavior, canary logic, fallback reasons
- 6 tests: Calibration building, application, renormalization

### E2E Tests (5 tests)
```bash
cd apps/web
BASE_URL=http://localhost:8000 pnpm exec playwright test tests/e2e/ml-canary.spec.ts
```
- Metrics presence check
- Counter increments
- Histogram buckets
- Prometheus format validation

### Integration Smoke Test
```bash
make ml-smoke
```
Full pipeline: features → train → predict → metrics verification

## 📈 Grafana Dashboard Panels

1. **Coverage** (stat): accepted / total ratio
2. **Disagreement** (stat): rule-vs-model mismatch rate
3. **Fallback Rate** (stat): fallback / total ratio
4. **Fallback Reasons** (timeseries): Breakdown by reason
5. **Agreement vs Total** (timeseries): Shadow comparison
6. **Predict Latency** (timeseries): p50, p95 quantiles
7. **Accepted vs Rejected** (timeseries): Model usage trend

## 🔄 Common Operations

### Rollback to Rules
```bash
SUGGEST_USE_MODEL_CANARY=0
docker compose -f docker-compose.prod.yml restart backend
```

### Adjust Thresholds
```bash
# Lower Shopping threshold from 0.65 to 0.60
SUGGEST_THRESHOLDS_JSON={"Groceries":0.70,"Dining":0.75,"Shopping":0.60,...}
docker compose -f docker-compose.prod.yml restart backend
```

### Retrain Model
```bash
make ml-features  # Rebuild features
make ml-train     # Train with acceptance gate
make ml-status    # Verify deployment
```

### Check Model Health
```bash
# Quick health check
curl http://localhost:8000/ml/v2/model/status | jq

# Detailed metrics
curl http://localhost:8000/metrics | grep lm_ml

# Grafana dashboard
open http://localhost:3000/d/ml-canary-overview
```

## 🐛 Troubleshooting

### High Disagreement (>25%)
```bash
# Check shadow comparison
curl http://localhost:8000/metrics | grep lm_suggest_compare_total

# Actions:
# 1. Review per-class F1 scores
# 2. Retrain with more data
# 3. Adjust thresholds
```

### Low Coverage (<60%)
```bash
# Check fallback reasons
curl http://localhost:8000/metrics | grep lm_ml_fallback_total

# Common causes:
# - Thresholds too high: Lower in SUGGEST_THRESHOLDS_JSON
# - Canary too low: Increase SUGGEST_USE_MODEL_CANARY
# - Model unavailable: Check ml-status
```

### High Latency (p95 >150ms)
```bash
# Check latency histogram
curl http://localhost:8000/metrics | grep lm_ml_predict_latency_seconds

# Actions:
# 1. Profile prediction code
# 2. Reduce model complexity (n_estimators)
# 3. Cache frequent merchants
```

## 📚 Documentation Links

- **Deployment Runbook**: `ML_CANARY_DEPLOYMENT.md`
- **Config Reference**: `apps/backend/.env.example`
- **Metrics Guide**: `ML_CANARY_DEPLOYMENT.md#metrics-reference`
- **API Docs**: `http://localhost:8000/docs` (FastAPI Swagger)

## ✅ Pre-commit Validation

Dashboard auto-validates:
```bash
make precommit-run
# Validates: ops/grafana/dashboards/ml-canary-overview.json
```

Prometheus rules:
```bash
promtool check rules prometheus/rules/ml_phase3.yml
```

## 🎯 Success Criteria

- ✅ **Shadow Mode**: Agreement >70% (1-2 weeks)
- ✅ **10% Canary**: No user complaints, latency <100ms (3-7 days)
- ✅ **50% Canary**: Stable metrics, positive feedback (1 week)
- ✅ **100% Rollout**: >80% model acceptance
- ✅ **Latency**: p95 <100ms, p99 <150ms
- ✅ **Availability**: >95% model available
- ✅ **Tests**: All 17 tests passing (12 unit + 5 E2E)

---

**Implementation Status**: ✅ Complete  
**Last Updated**: November 4, 2025  
**Version**: Phase 3 (Calibration + Canary + Acceptance Gates)
