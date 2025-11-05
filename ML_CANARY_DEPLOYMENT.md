# ML Canary Deployment Runbook

Complete guide for deploying ML category suggestions with canary rollout, per-class thresholds, and isotonic calibration.

## Overview

This system enables safe ML model deployment with:
- **Shadow Mode**: Compare model vs rules without affecting users
- **Canary Rollout**: Gradual rollout (0% → 10% → 50% → 100%)
- **Per-Class Thresholds**: Different confidence requirements per category
- **Isotonic Calibration**: Improved probability estimates
- **Acceptance Gates**: Automatic quality checks before deployment
- **Comprehensive Metrics**: Full observability via Prometheus

## Architecture

```
┌─────────────┐
│  Training   │  Fit LightGBM + IsotonicRegression per class
│   Pipeline  │  Check acceptance gate (F1 >= thresholds)
└──────┬──────┘  Save: pipeline.joblib + calibrator.pkl
       │
       ▼
┌─────────────┐
│  Registry   │  Store model artifacts + metadata
│   /latest/  │  Swap only if gate passes
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Serving   │  1) Compute rules (always)
│   (serve.py)│  2) Shadow predict + latency metric
│             │  3) Compare: emit agreement metric
│             │  4) Canary check: _in_canary() + thresholds
│             │  5) Return model or rules
└─────────────┘
```

## Configuration

### Environment Variables

Add to `apps/backend/.env`:

```bash
# Shadow mode (always predict for comparison)
SUGGEST_ENABLE_SHADOW=1

# Canary percentage: "0", "10%", "50%", "100"
SUGGEST_USE_MODEL_CANARY=0

# Per-class thresholds (JSON)
SUGGEST_THRESHOLDS_JSON={"Groceries":0.70,"Dining":0.75,"Shopping":0.65,"Transport":0.65,"Subscriptions":0.70,"Entertainment":0.60}

# Calibration toggle
ML_CALIBRATION_ENABLED=1

# Training acceptance gates
ML_DEPLOY_THRESHOLD_F1=0.72        # Macro F1 threshold
ML_DEPLOY_THRESHOLD_F1_MIN=0.60    # Per-class minimum F1
```

### Files Modified

1. **config.py**: Added ML controls (shadow, canary, thresholds, calibration)
2. **metrics_ml.py**: Added 4 new metrics (predictions, fallback, latency, compare)
3. **serve.py**: Enhanced suggest_auto() with canary logic + thresholds
4. **train.py**: Added isotonic calibration + acceptance gate
5. **model.py**: Enhanced to load/apply calibrators
6. **Makefile**: Added ml-eval, ml-thresholds, ml-canary targets

## Deployment Steps

### Step 1: Initial Shadow Deployment (Week 1)

**Goal**: Collect comparison metrics without affecting users

```bash
# Set environment (in .env or docker-compose)
SUGGEST_ENABLE_SHADOW=1
SUGGEST_USE_MODEL_CANARY=0  # Rules only for users

# Rebuild backend
docker compose -f docker-compose.prod.yml up -d --build backend

# Train model
make ml-train

# Check status
make ml-status
make ml-thresholds

# Monitor metrics (1-2 weeks)
curl http://localhost:8000/metrics | grep lm_suggest_compare_total
# Look for: agree="True" vs agree="False" ratio
```

**Success Criteria**:
- Model available: `lm_ml_predict_requests_total{available="True"}` > 90%
- Agreement rate: `lm_suggest_compare_total{agree="True"}` > 70%
- No errors in logs

### Step 2: 10% Canary Rollout (Week 2)

**Goal**: Test model with small subset of users

```bash
# Update canary percentage
# In .env:
SUGGEST_USE_MODEL_CANARY=10%

# Restart backend (no rebuild needed)
docker compose -f docker-compose.prod.yml restart backend

# Monitor for 3-7 days
curl http://localhost:8000/metrics | grep -E "lm_ml_predictions_total|lm_ml_fallback_total"
```

**Expected Metrics**:
```
lm_ml_predictions_total{accepted="True"} ~10% of suggestions
lm_ml_predictions_total{accepted="False"} ~90% of suggestions
lm_ml_fallback_total{reason="not_in_canary"} ~90%
lm_ml_fallback_total{reason="low_confidence"} ~5%
```

**Success Criteria**:
- No increase in user complaints
- Latency < 100ms: `lm_ml_predict_latency_seconds` p99 < 0.1
- Fallback reasons tracked properly

### Step 3: 50% Canary Rollout (Week 3)

**Goal**: Scale to half of users

```bash
# Update canary
SUGGEST_USE_MODEL_CANARY=50%

# Restart
docker compose -f docker-compose.prod.yml restart backend

# Monitor for 1 week
```

**Success Criteria**:
- Accepted ratio: 50% ± 5%
- Latency stable
- User feedback positive or neutral

### Step 4: 100% Rollout (Week 4)

**Goal**: Full production deployment

```bash
# Update canary
SUGGEST_USE_MODEL_CANARY=100

# Restart
docker compose -f docker-compose.prod.yml restart backend

# Final validation
make ml-smoke
```

**Success Criteria**:
- 100% of eligible predictions use model
- Fallback only for low_confidence or unavailable
- Shadow mode can be disabled: `SUGGEST_ENABLE_SHADOW=0`

## Monitoring

### Key Metrics

```bash
# Check metrics endpoint
curl http://localhost:8000/metrics | grep lm_ml

# Predictions accepted/rejected
lm_ml_predictions_total{accepted="True"}
lm_ml_predictions_total{accepted="False"}

# Fallback reasons
lm_ml_fallback_total{reason="unavailable"}
lm_ml_fallback_total{reason="not_in_canary"}
lm_ml_fallback_total{reason="low_confidence"}
lm_ml_fallback_total{reason="unknown"}

# Comparison (shadow mode)
lm_suggest_compare_total{agree="True"}
lm_suggest_compare_total{agree="False"}
lm_suggest_compare_total{agree="None"}

# Latency
lm_ml_predict_latency_seconds_bucket{le="0.05"}  # 50ms
lm_ml_predict_latency_seconds_bucket{le="0.1"}   # 100ms
```

### Grafana Dashboard

Create dashboard with:
1. **Canary Progress**: accepted ratio over time
2. **Fallback Breakdown**: stacked area by reason
3. **Agreement Rate**: line chart (shadow comparison)
4. **Latency P50/P95/P99**: histogram quantiles
5. **Per-Class Performance**: F1 scores from training runs

## Tuning Thresholds

### Analyze Current Thresholds

```bash
# Get current config
make ml-thresholds

# Output:
# {
#   "shadow": true,
#   "canary": "10%",
#   "thresholds": {
#     "Groceries": 0.70,
#     "Dining": 0.75,
#     ...
#   },
#   "calibration": true
# }
```

### Adjust Based on Metrics

```bash
# If too many low_confidence fallbacks for "Shopping":
# Lower threshold: 0.65 → 0.60

# Update .env:
SUGGEST_THRESHOLDS_JSON={"Groceries":0.70,"Dining":0.75,"Shopping":0.60,...}

# Restart backend
docker compose -f docker-compose.prod.yml restart backend
```

### Validation

Run evaluation mode to test thresholds without deployment:

```bash
# Train without auto-deploy
make ml-eval

# Review output JSON for per-class F1 scores
# Adjust thresholds to balance precision/recall
```

## Retraining

### When to Retrain

- New labeled data accumulated (>1000 transactions)
- Performance degradation detected
- New categories added
- Scheduled monthly retraining

### Retraining Process

```bash
# 1. Build fresh features
make ml-features

# 2. Train with acceptance gate
make ml-train

# Sample output:
# {
#   "run_id": "run_a3f8b2c1",
#   "val_f1_macro": 0.78,
#   "val_f1_min": 0.64,
#   "val_f1_per_class": {
#     "Groceries": 0.82,
#     "Dining": 0.76,
#     ...
#   },
#   "passed_acceptance_gate": true,
#   "deployed": true,
#   "calibration_enabled": true
# }

# 3. If gate passed, model auto-deploys to /latest/
# 4. Reload cache
curl -X POST http://localhost:8000/ml/v2/reload

# 5. Verify new model active
make ml-status
```

### Acceptance Gate Failure

If training fails gate:

```json
{
  "passed_acceptance_gate": false,
  "deployed": false,
  "deploy_reason": "Failed gate: f1_macro=0.68 (need 0.72), min_f1=0.52 (need 0.60)"
}
```

**Actions**:
1. Review per-class F1 scores
2. Investigate low-performing classes (data quality? feature engineering?)
3. Consider lowering thresholds temporarily (not recommended)
4. Add more training data for weak classes
5. Retrain with improvements

## Rollback

### Quick Rollback to Rules

```bash
# Set canary to 0
SUGGEST_USE_MODEL_CANARY=0

# Restart backend (instant)
docker compose -f docker-compose.prod.yml restart backend

# Verify
curl http://localhost:8000/metrics | grep lm_ml_predictions_total
# Should see: accepted="False" only
```

### Rollback to Previous Model

```bash
# List available runs
ls /app/models/ledger_suggestions/

# Example: run_a3f8b2c1_1730764800/

# Swap to previous run (manual registry operation)
docker compose exec backend python -c "
from app.ml import registry
registry.swap_to('run_a3f8b2c1_1730764800')
"

# Reload cache
curl -X POST http://localhost:8000/ml/v2/reload

# Verify
make ml-status
```

## Troubleshooting

### Model Not Loading

```bash
# Check registry
docker compose exec backend ls -la /app/models/ledger_suggestions/latest/

# Should contain:
# - pipeline.joblib
# - classes.json
# - calibrator.pkl (if calibration enabled)

# Check logs
docker compose logs backend | grep -i "model"
```

### High Latency

```bash
# Check latency histogram
curl http://localhost:8000/metrics | grep lm_ml_predict_latency_seconds

# If p99 > 200ms:
# 1. Check model size (too many estimators?)
# 2. Profile prediction code
# 3. Consider caching frequent merchants
```

### Low Agreement Rate

```bash
# If agree="True" < 60% in shadow mode:
# 1. Rules may be overfitting to specific merchants
# 2. Model needs more training data
# 3. Feature engineering needed
# 4. Check data distribution drift
```

### Calibration Issues

```bash
# If calibration fails during training:
# 1. Check validation set size (need >100 samples per class)
# 2. Verify IsotonicRegression installed: pip install scikit-learn>=1.0
# 3. Disable temporarily: ML_CALIBRATION_ENABLED=0
```

## Testing

### Local Development

```bash
# Start dev stack
docker compose -f docker-compose.dev.yml up -d

# Train with small limit
docker compose exec backend python -c "
from app.ml.train import run_train
import json
result = run_train(limit=5000)
print(json.dumps(result, indent=2))
"

# Test suggestion with canary
curl -X POST http://localhost:8000/agent/suggestions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{"txn_ids": ["123"], "mode": "auto"}'
```

### E2E Smoke Test

```bash
# Full pipeline
make ml-smoke

# Expected output:
# 🧪 ML Phase 2 smoke test with calibration + canary...
# ✅ Features built
# ✅ Model trained
# ✅ Status checked
# ✅ Thresholds verified
# ✅ Prediction successful
# 📊 Metrics present
# ✅ ML Phase 2 smoke test PASSED
```

## Metrics Reference

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `lm_ml_predictions_total` | Counter | `accepted` | Total predictions (True=model used, False=fallback) |
| `lm_ml_fallback_total` | Counter | `reason` | Fallback reasons (unavailable, not_in_canary, low_confidence) |
| `lm_ml_predict_latency_seconds` | Histogram | - | ML prediction latency |
| `lm_suggest_compare_total` | Counter | `agree` | Shadow comparison (True=match, False=mismatch) |
| `ml_predict_requests_total` | Counter | `available` | Model availability tracking |
| `suggest_source_total` | Counter | `source` | Suggestion source (rule, model, shadow) |

## Best Practices

1. **Always use shadow mode first**: Collect comparison metrics for 1-2 weeks
2. **Gradual rollout**: 0% → 10% → 50% → 100% with monitoring at each stage
3. **Monitor latency**: Keep p99 < 100ms for good UX
4. **Tune thresholds**: Balance precision (high threshold) vs coverage (low threshold)
5. **Retrain regularly**: Monthly retraining recommended
6. **Gate enforcement**: Never bypass acceptance gate in production
7. **Calibration enabled**: Improves probability estimates significantly
8. **Rollback plan**: Always have quick rollback to rules (canary=0)

## Support

For issues or questions:
1. Check metrics endpoint: `curl http://localhost:8000/metrics`
2. Review backend logs: `docker compose logs backend --tail=100`
3. Verify config: `make ml-thresholds`
4. Run smoke test: `make ml-smoke`

---

**Last Updated**: Step 4-7 implementation (November 4, 2025)
**Status**: Production-ready with calibration + canary + acceptance gates
