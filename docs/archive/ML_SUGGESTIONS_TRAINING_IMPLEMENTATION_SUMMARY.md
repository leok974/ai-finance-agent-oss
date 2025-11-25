# ML Suggestions - Training & Rollout Implementation Summary

**Date:** November 4, 2025
**Branch:** website-cleaning
**Commit:** b285b4bc "feat(ml): add complete training pipeline and model serving infrastructure"

---

## Overview

Applied the **Verify, Train, and Rollout** playbook from the reference document. Implemented complete ML training pipeline with safe rollout capabilities (shadow → canary → full deployment).

---

## What Was Built

### 1. Feature Extraction Module (`features.py`)

**New file:** `apps/backend/app/services/suggest/features.py`

**25 Features Implemented:**

**Numeric (4):**
- `amount` - Transaction amount
- `amount_abs` - Absolute value of amount
- `is_negative` - Boolean flag (1.0 if negative)
- `is_positive` - Boolean flag (1.0 if positive)

**Text Length (2):**
- `merchant_len` - Character count of merchant name
- `memo_len` - Character count of memo/description

**Merchant Keywords (11):**
- `has_amazon`, `has_uber`, `has_lyft`, `has_zelle`, `has_venmo`
- `has_costco`, `has_target`, `has_walmart`, `has_whole_foods`
- `has_netflix`, `has_spotify`

**Category Keywords (8):**
- `has_rent`, `has_coffee`, `has_lunch`, `has_dinner`
- `has_gas`, `has_pharmacy`, `has_gym`, `has_grocery`

**Key Functions:**
```python
extract_features(txn) → dict  # Extract all 25 features
FEATURE_NAMES  # List of feature names in correct order
```

### 2. Enhanced Model Serving (`serve.py`)

**Updated file:** `apps/backend/app/services/suggest/serve.py`

**New Capabilities:**

**Model Loading:**
- `_load_model()` - Lazy-load joblib model with metadata caching
- Extracts feature list, model_id, classes from model metadata
- Global cache prevents repeated disk I/O

**Inference:**
- `_predict_with_model(txn)` - Full inference pipeline
  - Extracts features using `extract_features()`
  - Builds feature vector in correct order
  - Calls `model.predict_proba()` on calibrated classifier
  - Filters by `SUGGEST_MIN_CONF` threshold
  - Returns top K candidates

**Shadow/Canary Logic:**
- `suggest_auto(txn)` enhanced with:
  - **Shadow mode**: Model runs silently, metrics tracked
  - **Canary sampling**: Percentage-based rollout (0-100%)
  - **Source tracking**: Labels metrics as "live", "shadow", or "canary"
  - **Graceful fallback**: Falls back to heuristics on model errors

**Metrics Integration:**
- All predictions tagged by `mode={heuristic|model}` and `source={live|shadow|canary}`
- Enables A/B testing and safe rollout monitoring

### 3. Training Script (`train_lightgbm.py`)

**New file:** `apps/backend/app/ml/train_lightgbm.py`

**Pipeline:**
1. Load labeled data (parquet/CSV with `label` column + 25 features)
2. Validate feature alignment with `FEATURE_NAMES`
3. Train LightGBM classifier:
   - 300 estimators
   - Learning rate: 0.05
   - 63 leaf nodes
   - 90% subsample
4. Calibrate probabilities (sigmoid/Platt scaling)
5. Cross-validate (3-fold)
6. Evaluate on 20% test set
7. Save model + metadata as joblib

**Output:**
- `data/models/model.joblib` - Trained model (CalibratedClassifierCV)
- `data/models/version.json` - Metadata JSON:
  ```json
  {
    "features": [...],
    "n_classes": 10,
    "classes": ["Groceries", "Dining", ...],
    "metrics": {"accuracy": 0.87, "cv_mean": 0.85},
    "feature_importance": {...},
    "trained_at": "2025-11-04T..."
  }
  ```

**Usage:**
```bash
python -m app.ml.train_lightgbm \
  --golden-path data/golden/txns_labeled.parquet \
  --out-dir data/models \
  --test-size 0.2
```

### 4. Sample Data Generator (`generate_sample_data.py`)

**New file:** `apps/backend/app/ml/generate_sample_data.py`

**Purpose:** Generate synthetic labeled training data for testing/development

**Features:**
- 30 transaction templates across 10 categories
- Realistic merchant names, memos, amount ranges
- Auto-extracts features using `extract_features()`
- Outputs parquet/CSV matching training schema

**Usage:**
```bash
python -m app.ml.generate_sample_data \
  --output data/golden/txns_labeled.parquet \
  --n-samples 1000
```

**Sample Data:**
- **Groceries:** Costco, Whole Foods, Trader Joe's, Safeway
- **Dining:** Starbucks, Chipotle, Dominos, Cheesecake Factory
- **Transportation:** Uber, Lyft, Shell, Chevron
- **Entertainment:** Netflix, Spotify, AMC Theatres, Steam
- **Shopping:** Amazon, Target, Walmart, Best Buy
- **Healthcare:** CVS, Walgreens, 24 Hour Fitness, Kaiser
- **Transfers:** Zelle, Venmo
- **Utilities:** PG&E, Comcast
- **Income:** Direct Deposit, Venmo payments

### 5. Updated Playwright Tests

**Modified file:** `apps/web/tests/e2e/suggestions-smoke.spec.ts`

**Changes:**
- Use `E2E_TXN_ID` environment variable for test transaction ID
- Changed from UUID to integer ID (matches DB schema)
- Updated mode from "heuristic" to "auto" (tests full pipeline)
- Improved documentation

**Usage:**
```bash
# Set test transaction ID
export E2E_TXN_ID=123
pnpm run test:e2e
```

### 6. Comprehensive Documentation

**New file:** `apps/backend/app/ml/README.md` (400+ lines)

**Sections:**
1. **Quick Start** - Step-by-step setup
2. **Architecture** - Feature extraction, serving, training
3. **Rollout Strategy** - Shadow → Canary 10% → 25% → 50% → 100%
4. **Production Checklist** - Data prep, training, deployment, monitoring
5. **Metrics** - Prometheus queries for accept rate, latency, coverage
6. **Troubleshooting** - Common issues and solutions
7. **Advanced Topics** - Custom features, ensemble models, active learning

---

## Rollout Playbook

### Phase 1: Shadow Mode (Validation)

**Config:**
```env
SUGGEST_MODE=auto
SUGGEST_SHADOW=true
SUGGEST_CANARY_PCT=0
```

**Behavior:**
- All traffic served by heuristics
- Model runs silently in background
- Metrics collected with `source=shadow` label

**Validation:**
- Monitor model inference latency
- Compare model predictions vs actual user choices
- Check for inference errors in logs

**Duration:** 24-48 hours

### Phase 2: Canary 10%

**Config:**
```env
SUGGEST_CANARY_PCT=10
```

**Behavior:**
- 10% of requests use model predictions
- 90% still use heuristics
- Both tagged in metrics

**Metrics to Watch:**
- Accept rate: model vs heuristic
- Latency P95: should stay < 200ms
- Error rate: should stay < 1%

**Success Criteria:**
- Model accept rate ≥ heuristic accept rate
- No significant latency increase
- No errors/crashes

**Duration:** 2-3 days

### Phase 3: Ramp Up

**Config:**
```env
SUGGEST_CANARY_PCT=25  # Then 50, 75
```

**Behavior:**
- Gradually increase model traffic
- Continue monitoring metrics

**Increments:**
- 10% → 25% (2 days)
- 25% → 50% (2 days)
- 50% → 75% (2 days)
- 75% → 100% (1 day)

### Phase 4: Full Deployment

**Config:**
```env
SUGGEST_MODE=model
SUGGEST_CANARY_PCT=100
```

**Behavior:**
- All traffic uses model
- Heuristics only as fallback on errors

**Rollback:** Set `SUGGEST_CANARY_PCT=0` or `SUGGEST_MODE=heuristic`

---

## Environment Configuration

### Required Variables

```env
# Master switch
SUGGEST_ENABLED=true

# Mode selection
SUGGEST_MODE=auto  # heuristic | model | auto

# Model path (must be mounted read-only)
SUGGEST_MODEL_PATH=/app/data/models/model.joblib

# Progressive rollout
SUGGEST_SHADOW=true       # Compute model silently
SUGGEST_CANARY_PCT=0      # % of traffic using model (0-100)

# Quality controls
SUGGEST_MIN_CONF=0.65     # Minimum confidence threshold
SUGGEST_TOPK=3            # Max suggestions per transaction
```

### Docker Compose

Add volume mount for model:

```yaml
services:
  backend:
    volumes:
      - ./data/models:/app/data/models:ro  # Read-only
```

---

## Verification Steps

### 1. Test Feature Extraction

```bash
cd apps/backend
python -c "
from app.services.suggest.features import extract_features
txn = {'merchant': 'COSTCO', 'memo': 'Grocery', 'amount': -125.43}
print(extract_features(txn))
"
```

**Expected output:** Dict with 25 keys (all features)

### 2. Generate Sample Data

```bash
python -m app.ml.generate_sample_data --n-samples 100
ls -lh data/golden/txns_labeled.parquet
```

**Expected:** ~10KB parquet file with 100 rows, 26 columns (features + label)

### 3. Train Model

```bash
python -m app.ml.train_lightgbm
ls -lh data/models/
```

**Expected:**
- `model.joblib` (~500KB-2MB)
- `version.json` (~1KB)
- Accuracy > 0.80 for synthetic data

### 4. Test Model Loading

```bash
python -c "
import joblib
blob = joblib.load('data/models/model.joblib')
print(blob['meta']['metrics'])
"
```

**Expected:** Metrics dict with accuracy, cv_mean, cv_std

### 5. API Smoke Test

```bash
# Start backend with model
SUGGEST_MODEL_PATH=/app/data/models/model.joblib docker compose up -d backend

# Test suggestions endpoint
curl -X POST http://localhost:8000/agent/tools/suggestions \
  -H 'Content-Type: application/json' \
  -d '{"txn_ids":["1"], "mode":"auto"}'
```

**Expected:** JSON with suggestions, event_id, model_id

### 6. Check Metrics

```bash
curl -s http://localhost:8000/metrics | grep lm_suggestions
```

**Expected metrics:**
- `lm_suggestions_total{mode="...",source="..."}`
- `lm_suggestions_covered_total`
- `lm_suggestions_accept_total`
- `lm_suggestions_latency_ms_bucket`

---

## Files Created/Modified

### Created (7 files):

1. **`apps/backend/app/ml/__init__.py`** - Module init
2. **`apps/backend/app/ml/train_lightgbm.py`** - Training script (230 lines)
3. **`apps/backend/app/ml/generate_sample_data.py`** - Sample data generator (220 lines)
4. **`apps/backend/app/ml/README.md`** - Comprehensive docs (400+ lines)
5. **`apps/backend/app/services/suggest/features.py`** - Feature extraction (105 lines)

### Modified (2 files):

6. **`apps/backend/app/services/suggest/serve.py`** - Enhanced model serving (+50 lines)
7. **`apps/web/tests/e2e/suggestions-smoke.spec.ts`** - Updated tests (+5 lines)

**Total:** ~1,075 insertions, 87 deletions

---

## Deployment Status

### Backend
✅ Container rebuilt with ML training infrastructure
✅ Backend healthy (Status: Up, healthy)
✅ No Python lint/type errors
✅ Black formatting passed
✅ Committed: b285b4bc
✅ Pushed to website-cleaning branch

### Frontend
✅ TypeScript compilation clean
✅ Playwright tests updated
✅ No build errors

---

## Next Steps

### Immediate (Development/Testing):

1. **Generate sample data:**
   ```bash
   python -m app.ml.generate_sample_data --n-samples 1000
   ```

2. **Train initial model:**
   ```bash
   python -m app.ml.train_lightgbm
   ```

3. **Test model serving:**
   - Set `SUGGEST_MODEL_PATH` in backend env
   - Restart backend
   - Call suggestions API
   - Verify model predictions appear

4. **Enable shadow mode:**
   ```env
   SUGGEST_SHADOW=true
   SUGGEST_CANARY_PCT=0
   ```
   - Monitor metrics for 24 hours
   - Check `lm_suggestions_total{source="shadow"}`

### Short-term (Production Preparation):

1. **Collect real training data:**
   - Export transactions with user-confirmed categories
   - Aim for 10K+ labeled transactions
   - Balance class distribution

2. **Train production model:**
   - Use real data
   - Validate accuracy > 85%
   - Check per-category precision/recall

3. **Set up monitoring:**
   - Grafana dashboard for metrics
   - Alert on accept rate drop
   - Alert on latency spike

4. **Begin rollout:**
   - Shadow mode (48 hours)
   - Canary 10% (3 days)
   - Ramp to 100% over 2 weeks

### Medium-term (Optimization):

1. **Feature engineering:**
   - Add day_of_week, account_type
   - Merchant normalization
   - Transaction patterns (velocity, frequency)

2. **Model improvements:**
   - Try XGBoost, CatBoost
   - Ensemble models
   - Hyperparameter tuning

3. **Active learning:**
   - Prioritize feedback on low-confidence predictions
   - Retrain monthly with new feedback

4. **Performance:**
   - Batch inference for bulk requests
   - ONNX conversion for faster inference
   - Redis caching for frequent patterns

---

## Success Metrics

### Implementation: ✅ COMPLETE

- [x] Feature extraction module (25 features)
- [x] Model serving with shadow/canary
- [x] Training script (LightGBM + calibration)
- [x] Sample data generator
- [x] Updated Playwright tests
- [x] Comprehensive documentation
- [x] Backend deployed successfully
- [x] No errors or lint issues

### Validation: 🎯 READY

- [ ] Generate sample data and verify schema
- [ ] Train model and achieve >80% accuracy
- [ ] Test model loading and inference
- [ ] Run shadow mode and collect metrics
- [ ] Compare model vs heuristic performance

### Production: 📊 PENDING

- [ ] Collect 10K+ real labeled transactions
- [ ] Train production-grade model
- [ ] Deploy with shadow mode
- [ ] Canary rollout (10% → 100%)
- [ ] Monitor accept rates and latency
- [ ] Measure business impact (categorization rate, time saved)

---

## Key Improvements vs Previous Implementation

### Phase 1 (Baseline):
- Heuristic rules only
- No ML infrastructure

### Phase 2 (Integration):
- Basic model serving placeholder
- Feature extraction stub

### Phase 3 (Training - CURRENT):
- ✅ **Complete feature extraction** (25 features aligned with training)
- ✅ **Full model inference** (joblib, predict_proba, calibrated)
- ✅ **Shadow mode** (silent evaluation)
- ✅ **Canary sampling** (percentage-based rollout)
- ✅ **Training pipeline** (LightGBM + calibration)
- ✅ **Sample data generator** (synthetic transactions)
- ✅ **Production docs** (rollout playbook, troubleshooting)

---

## Risk Mitigation

### Guardrails in Place:

1. **Fallback Safety:** Always returns ≥1 candidate (heuristic fallback)
2. **Shadow Mode:** Test model without impacting users
3. **Canary Rollout:** Gradual traffic increase (0% → 100%)
4. **Metrics Tagging:** Track performance by mode/source
5. **Error Handling:** Graceful degradation on model failures
6. **Confidence Filtering:** Only suggest if confidence ≥ threshold
7. **Feature Alignment:** Training and serving use same FEATURE_NAMES list
8. **Instant Rollback:** Set SUGGEST_CANARY_PCT=0 to disable model

### Alerts Recommended:

- Accept rate drops >5% WoW
- Latency P95 >200ms
- Error rate >1%
- Coverage <target% (e.g., 80%)
- Model load failures

---

## Conclusion

Successfully implemented **complete ML training pipeline** with:

- ✅ Production-ready feature extraction (25 features)
- ✅ Full model serving infrastructure (load, infer, fallback)
- ✅ Safe rollout capabilities (shadow → canary → full)
- ✅ Training script with calibration and validation
- ✅ Sample data generation for quick testing
- ✅ Comprehensive documentation (400+ lines)
- ✅ Updated tests and deployed backend

**Status:** ✅ **TRAINING INFRASTRUCTURE COMPLETE** - Ready for model training and shadow mode validation

**Next Action:** Generate sample data, train model, enable shadow mode, collect metrics for 24 hours, then begin canary rollout.
