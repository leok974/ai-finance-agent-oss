# ML Suggestions Module

This module implements ML-powered category suggestions for transactions with safe rollout capabilities (shadow → canary → full).

## Quick Start

### 1. Generate Sample Data (Optional)

For testing or initial development:

```bash
cd apps/backend
python -m app.ml.generate_sample_data \
  --output data/golden/txns_labeled.parquet \
  --n-samples 1000
```

This creates synthetic labeled transaction data matching your feature schema.

### 2. Train Model

```bash
python -m app.ml.train_lightgbm \
  --golden-path data/golden/txns_labeled.parquet \
  --out-dir data/models \
  --test-size 0.2
```

**Output:**
- `data/models/model.joblib` - Trained LightGBM + calibrated probabilities
- `data/models/version.json` - Metadata (features, metrics, classes)

### 3. Configure Backend

Set environment variables:

```env
# Master switch
SUGGEST_ENABLED=true

# Mode: heuristic | model | auto
SUGGEST_MODE=auto

# Model path (mount this read-only in production)
SUGGEST_MODEL_PATH=/app/data/models/model.joblib

# Progressive rollout
SUGGEST_SHADOW=true       # Compute model silently (for evaluation)
SUGGEST_CANARY_PCT=0      # % of requests using model (0-100)

# Quality controls
SUGGEST_MIN_CONF=0.65     # Minimum confidence threshold
SUGGEST_TOPK=3            # Max suggestions per transaction
```

### 4. Rollout Strategy

**Phase 1: Shadow Mode** (Validate Silently)
```env
SUGGEST_MODE=auto
SUGGEST_SHADOW=true
SUGGEST_CANARY_PCT=0
```
- Heuristics serve all traffic
- Model runs silently for metrics collection
- Compare model vs heuristic performance in Grafana

**Phase 2: Canary 10%**
```env
SUGGEST_MODE=auto
SUGGEST_CANARY_PCT=10
```
- 10% of requests use model
- 90% use heuristics
- Monitor accept rates, latency, errors

**Phase 3: Ramp Up**
```env
SUGGEST_CANARY_PCT=25  # Then 50, 75, 100
```

**Phase 4: Full Model**
```env
SUGGEST_MODE=model
SUGGEST_CANARY_PCT=100
```

**Rollback:** Set `SUGGEST_CANARY_PCT=0` or `SUGGEST_MODE=heuristic`

## Architecture

### Feature Extraction (`features.py`)

```python
from app.services.suggest.features import extract_features, FEATURE_NAMES

txn = {
    "merchant": "COSTCO WHOLESALE",
    "memo": "Weekly grocery shopping",
    "amount": -125.43,
}

features = extract_features(txn)
# {
#   "amount": -125.43,
#   "amount_abs": 125.43,
#   "is_negative": 1.0,
#   "merchant_len": 17,
#   "has_costco": 1.0,
#   "has_grocery": 1.0,
#   ...
# }
```

**Features** (25 total):
- **Numeric:** amount, amount_abs, is_negative, is_positive
- **Text length:** merchant_len, memo_len
- **Merchant keywords:** has_amazon, has_uber, has_costco, etc. (11 keywords)
- **Category keywords:** has_rent, has_coffee, has_lunch, etc. (8 keywords)

### Model Serving (`serve.py`)

```python
from app.services.suggest.serve import suggest_auto

txn = {...}
candidates, model_id, features_hash, source = suggest_auto(txn)

# candidates: [{"label": "Groceries", "confidence": 0.89, "reasons": ["model:lgbm"]}]
# model_id: "lgbm@a1b2c3d4"
# features_hash: "e5f6g7h8" (SHA256 of features, first 16 chars)
# source: "live" | "shadow" | "canary"
```

**Logic:**
1. Check `SUGGEST_MODE`:
   - `heuristic` → Always use heuristics
   - `model` → Always use model (fallback to heuristics on error)
   - `auto` → Canary sampling based on `SUGGEST_CANARY_PCT`

2. Shadow mode: If enabled, run model silently and track metrics

3. Metrics tagged by `mode={heuristic|model}` and `source={live|shadow|canary}`

### Training (`train_lightgbm.py`)

**Pipeline:**
1. Load labeled data (parquet/CSV with `label` column + features)
2. Train LightGBM classifier (300 estimators, 63 leaves)
3. Calibrate probabilities with sigmoid (Platt scaling)
4. Cross-validate (3-fold)
5. Evaluate on test set
6. Save model + metadata as joblib

**Output metadata:**
```json
{
  "features": ["amount", "amount_abs", ...],
  "n_classes": 10,
  "classes": ["Groceries", "Dining", "Transportation", ...],
  "metrics": {
    "accuracy": 0.87,
    "cv_mean": 0.85,
    "cv_std": 0.02
  },
  "feature_importance": {
    "has_costco": 0.15,
    "amount_abs": 0.12,
    ...
  },
  "trained_at": "2025-11-04T01:30:00Z"
}
```

## Production Checklist

### Data Preparation
- [ ] Export transaction data with user-confirmed categories
- [ ] Clean and normalize merchant names
- [ ] Balance class distribution (handle rare categories)
- [ ] Split train/validation/test (60/20/20 or 70/15/15)
- [ ] Version control training data

### Model Training
- [ ] Run training script with production data
- [ ] Validate accuracy > baseline (heuristic)
- [ ] Check feature importance makes sense
- [ ] Evaluate per-category precision/recall
- [ ] Test model file loads correctly

### Deployment
- [ ] Mount model file read-only at `SUGGEST_MODEL_PATH`
- [ ] Start in shadow mode (`SUGGEST_SHADOW=true`, `SUGGEST_CANARY_PCT=0`)
- [ ] Monitor metrics for 24-48 hours
- [ ] Compare model vs heuristic accept rates
- [ ] Check latency P95 < 100ms

### Rollout
- [ ] Increase canary % gradually (10→25→50→100)
- [ ] Alert on accept rate drop >5% WoW
- [ ] Alert on latency P95 > 200ms
- [ ] Alert on error rate > 1%
- [ ] Document rollback procedure

### Monitoring
- [ ] Grafana dashboard with coverage, accept rate, latency
- [ ] Per-category accept rate tracking
- [ ] Model drift detection (weekly retrain if drift detected)
- [ ] A/B test framework for model comparison

## Metrics

**Prometheus metrics** (already instrumented):

```promql
# Total suggestions by mode and source
lm_suggestions_total{mode="heuristic|model", source="live|shadow|canary"}

# Coverage (% of transactions with suggestions)
lm_suggestions_covered_total

# User feedback
lm_suggestions_accept_total{label="<category>"}
lm_suggestions_reject_total{label="<category>"}

# Latency (ms)
lm_suggestions_latency_ms_bucket{le="..."}
```

**Example Grafana queries:**

**Accept Rate:**
```promql
sum(rate(lm_suggestions_accept_total[15m]))
/
(sum(rate(lm_suggestions_accept_total[15m])) + sum(rate(lm_suggestions_reject_total[15m])))
```

**Model vs Heuristic Accept Rate:**
```promql
# Add `source` label to feedback metrics in router for this comparison
sum(rate(lm_suggestions_accept_total{source="canary"}[15m]))
vs
sum(rate(lm_suggestions_accept_total{source="live"}[15m]))
```

## Troubleshooting

### Model not loading

**Symptoms:** All suggestions use heuristics, logs show "Failed to load model"

**Solutions:**
1. Check `SUGGEST_MODEL_PATH` is set and file exists
2. Verify file permissions (backend container can read)
3. Check joblib version compatibility
4. Validate model file format: `python -c "import joblib; m = joblib.load('model.joblib'); print(m)"`

### Low accuracy

**Symptoms:** Model accuracy < heuristic accept rate

**Solutions:**
1. Collect more training data (aim for 10K+ labeled transactions)
2. Balance class distribution (oversample rare categories)
3. Add more features (day_of_week, merchant category, account type)
4. Tune hyperparameters (learning rate, num_leaves, n_estimators)
5. Try different model (XGBoost, CatBoost)

### High latency

**Symptoms:** P95 latency > 200ms

**Solutions:**
1. Cache model in memory (already implemented via `_MODEL_CACHE`)
2. Reduce `n_estimators` in training
3. Use smaller model (prune low-importance features)
4. Add request batching for bulk suggestions
5. Consider ONNX conversion for faster inference

### Model drift

**Symptoms:** Accept rate degrades over time

**Solutions:**
1. Retrain weekly/monthly with recent feedback data
2. Monitor feature distributions for drift
3. Add new merchants to training data
4. Implement online learning (update model from feedback)

## Advanced Topics

### Custom Features

Edit `features.py` to add domain-specific features:

```python
# In extract_features():
feats["is_weekend"] = float(txn.get("date", "").weekday() in [5, 6])
feats["is_large_purchase"] = float(abs(amt) > 500)
feats["account_type"] = txn.get("account_type", "unknown")
```

**Important:** Update `FEATURE_NAMES` and retrain model.

### Ensemble Models

Replace LightGBM with ensemble:

```python
from sklearn.ensemble import VotingClassifier
clf = VotingClassifier([
    ("lgbm", LGBMClassifier(...)),
    ("xgb", XGBClassifier(...)),
    ("rf", RandomForestClassifier(...)),
], voting="soft")
```

### Active Learning

Prioritize user feedback on low-confidence predictions:

```python
if max_confidence < 0.75:
    # Flag for manual review
    # Collect feedback
    # Retrain with high-quality labels
```

## Files

```
apps/backend/app/ml/
├── __init__.py
├── train_lightgbm.py       # Training script
├── generate_sample_data.py # Sample data generator
└── README.md               # This file

apps/backend/app/services/suggest/
├── features.py             # Feature extraction
├── serve.py                # Model serving + shadow/canary
└── heuristics.py           # Fallback heuristic rules

data/
├── golden/
│   └── txns_labeled.parquet  # Training data
└── models/
    ├── model.joblib          # Trained model
    └── version.json          # Metadata
```

## References

- [LightGBM Documentation](https://lightgbm.readthedocs.io/)
- [Scikit-learn Calibration](https://scikit-learn.org/stable/modules/calibration.html)
- [ML Testing Best Practices](https://developers.google.com/machine-learning/testing-debugging)
- [Canary Deployments](https://martinfowler.com/bliki/CanaryRelease.html)
