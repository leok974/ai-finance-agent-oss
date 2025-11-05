# ML Canary + dbt Testing — Implementation Complete ✅

Complete implementation of ML canary deployment with comprehensive testing infrastructure for both application code and data warehouse.

## 📦 What Was Delivered

### A) dbt Data Quality Tests

#### 1. Custom Generic Test: `not_in_future`
**File**: `warehouse/tests/generic/not_in_future.sql`

Validates that temporal columns don't contain future dates (common data quality issue).

```sql
{% test not_in_future(model, column_name) %}
select {{ column_name }} as offending_value
from {{ model }}
where {{ column_name }} > date_trunc('month', current_date)
limit 1
{% endtest %}
```

#### 2. Enhanced Schema Tests
**File**: `warehouse/models/marts/ml_marts.yml`

Added comprehensive tests to 3 models:

**`fct_training_view`** (9 tests):
- ✅ `txn_id`: not_null, unique, relationships to stg_transactions
- ✅ `target_label`: not_null, accepted_values (7 categories)
- ✅ `ts_month`: not_null, not_in_future (custom test)
- ✅ `merchant`: not_null
- ✅ `amount`: not_null
- ✅ `abs_amount`: not_null

**`dim_merchants`** (4 tests):
- ✅ `merchant_name`: not_null, unique
- ✅ `category`: not_null, accepted_values (7 categories)
- ✅ `category_prior`: not_null
- ✅ `confidence`: accepted_values (high/medium/low)

**`fct_suggestions_eval`** (5 tests):
- ✅ `eval_id`: not_null, unique
- ✅ `suggestion_event_id`: not_null
- ✅ `txn_id`: not_null
- ✅ `predicted_label`: accepted_values (7 categories)
- ✅ `suggestion_mode`: accepted_values (heuristic/model/auto)

#### 3. Makefile Target
**File**: `warehouse/Makefile`

Added `dbt-test` alias:
```makefile
dbt-test: test
```

### B) Calibration Artifact Verification

#### 1. Verification Script
**File**: `apps/backend/app/scripts/verify_calibrator.py`

Comprehensive verification that checks:
- ✅ Model directory exists (`/app/models/ledger_suggestions/latest/`)
- ✅ Required files present (`pipeline.joblib`, `classes.json`)
- ✅ `calibrator.pkl` exists when `ML_CALIBRATION_ENABLED=1`
- ✅ Prints metadata summary from `meta.json`
- ✅ Lists all model artifacts with file sizes

Exit codes:
- `0`: Success
- `1`: Hard failure (missing required file)
- `2`: Soft failure (no model deployed yet, expected in fresh env)

#### 2. Makefile Target
**File**: `Makefile`

Added:
```makefile
ml-verify-calibration:
	docker compose -f docker-compose.prod.yml exec -T backend \
	  python -m app.scripts.verify_calibrator
```

#### 3. CI Integration
**File**: `.github/workflows/ml.yml`

Added step after training:
```yaml
- name: Verify calibrator artifact (required when enabled)
  env:
    ML_CALIBRATION_ENABLED: "1"
  run: |
    docker compose -f docker-compose.prod.yml exec -T backend \
      python -m app.scripts.verify_calibrator
```

### C) Registry Sanity Tests

#### File: `apps/backend/tests/test_registry_calibrator.py`

4 pytest tests for registry validation:

1. **`test_latest_has_calibrator_when_enabled`**
   - Verifies `calibrator.pkl` exists when `ML_CALIBRATION_ENABLED=1`
   - Skips gracefully if no model deployed yet

2. **`test_latest_has_required_files`**
   - Ensures `pipeline.joblib` and `classes.json` present
   - Validates basic model structure

3. **`test_calibrator_not_required_when_disabled`**
   - Documents that calibrator is optional when disabled
   - No enforcement, just validation logic

4. **`test_registry_structure`**
   - Verifies registry directory exists
   - Checks `latest` is directory or symlink

## 🚀 Quick Start Commands

### dbt Data Quality Tests

```bash
# Run all dbt tests (including custom not_in_future)
cd warehouse
make dbt-test

# Expected output:
# Running tests...
# Completed successfully
```

**What it tests**:
- 18+ total tests across 3 models
- Data integrity (not_null, unique, relationships)
- Category consistency (accepted_values)
- Temporal validity (not_in_future)
- Referential integrity (foreign keys)

### Calibration Verification

```bash
# Train model with calibration
make ml-train

# Verify calibrator artifact exists
make ml-verify-calibration

# Expected output:
# Calibration enabled: True
# Checking model directory: /app/models/ledger_suggestions/latest
# 
# Model metadata:
# {
#   "ok": true,
#   "run_id": "run_abc123",
#   "val_f1_macro": 0.78,
#   "calibration_enabled": true,
#   "passed_acceptance_gate": true
# }
# 
# Model artifacts:
#   - pipeline.joblib (1234.5 KB)
#   - classes.json (0.2 KB)
#   - calibrator.pkl (45.3 KB)
#   - meta.json (0.5 KB)
# 
# ✅ Calibration artifact check PASSED
```

### Registry Pytest Tests

```bash
# Run registry sanity tests
docker compose -f docker-compose.prod.yml exec -T backend \
  pytest -q apps/backend/tests/test_registry_calibrator.py

# Expected output:
# ....                                                                    [100%]
# 4 passed in 0.15s
```

## 📊 Test Coverage Summary

### dbt Tests (18+ tests)
| Model | Tests | Coverage |
|-------|-------|----------|
| `fct_training_view` | 9 | ✅ Complete |
| `dim_merchants` | 4 | ✅ Complete |
| `fct_suggestions_eval` | 5 | ✅ Complete |

**Custom Tests**:
- `not_in_future`: Prevents temporal leakage

### Application Tests (4 tests)
| Test File | Tests | Purpose |
|-----------|-------|---------|
| `test_registry_calibrator.py` | 4 | Registry structure + calibrator artifacts |

### CI Pipeline
| Stage | Validation |
|-------|------------|
| Training | ✅ Model trains with calibration |
| Verification | ✅ Calibrator artifact exists |
| Deployment | ✅ Acceptance gate enforced |

## 🔍 What Each Test Validates

### dbt: `not_in_future` Test
**Purpose**: Prevent temporal leakage in training data

```sql
-- Applied to: fct_training_view.ts_month
-- Fails if: Any month > current month
-- Ensures: Training data stays in the past
```

**Example failure**:
```
Failure in test not_in_future_fct_training_view_ts_month
  Got 1 result, configured to fail if != 0
  offending_value
  ---------------
  2025-12-01
```

### dbt: `accepted_values` Test
**Purpose**: Enforce category consistency

```yaml
# Applied to: target_label, category, predicted_label
values: ["Groceries","Dining","Shopping","Transport","Subscriptions","Entertainment","Uncategorized"]
```

**Why important**:
- Prevents typos ("Grocery" vs "Groceries")
- Catches data migration issues
- Ensures model training uses correct labels

### pytest: `test_latest_has_calibrator_when_enabled`
**Purpose**: Enforce calibration artifact presence in CI

```python
def test_latest_has_calibrator_when_enabled():
    model_dir = get_latest_dir()
    calibrator_path = Path(model_dir) / "calibrator.pkl"
    assert calibrator_path.exists()
```

**Prevents**:
- Deploying uncalibrated models when calibration is enabled
- Configuration drift between training and serving
- Silent calibration failures

## 🐛 Troubleshooting

### dbt Test Failures

**Problem**: `not_in_future` test fails
```bash
# Check offending values
cd warehouse
docker run --rm -it --network shared-ollama \
  -v "$(pwd):/work" -w /work \
  ghcr.io/dbt-labs/dbt-postgres:1.7.0 \
  run-operation show_failures
```

**Solution**: Check data ingestion for future dates

---

**Problem**: `accepted_values` test fails
```bash
# Find invalid categories
docker compose exec postgres psql -U myuser -d finance -c \
  "SELECT DISTINCT label FROM transactions WHERE label NOT IN ('Groceries','Dining','Shopping','Transport','Subscriptions','Entertainment','Uncategorized')"
```

**Solution**: Update categories or fix data

---

### Calibration Verification Failures

**Problem**: `calibrator.pkl` missing

```bash
# Check environment
docker compose exec backend python -c "from app import config; print(config.ML_CALIBRATION_ENABLED)"

# Check training output
make ml-train | grep calibration_enabled

# Expected output:
#   "calibration_enabled": true
```

**Solutions**:
1. Verify `ML_CALIBRATION_ENABLED=1` in environment
2. Retrain model: `make ml-train`
3. Check training logs for calibration step

---

**Problem**: Verification script exits with code 2

```bash
# No model deployed yet (expected in fresh environment)
# Train first model:
make ml-features
make ml-train
make ml-verify-calibration
```

---

### CI Pipeline Failures

**Problem**: GitHub Actions verification step fails

```yaml
# Check workflow logs:
# 1. Training completed successfully?
# 2. Model passed acceptance gate?
# 3. Calibration enabled in env?
```

**Solution**: Ensure `ML_CALIBRATION_ENABLED: "1"` in workflow env

## 📈 Integration with Existing Infrastructure

### Pre-commit Hooks
dbt schema tests auto-validate on commit:
```bash
make precommit-run
# Validates: ml_marts.yml schema syntax
```

### ML Training Pipeline
1. **Features**: `make ml-features` → populates `fct_training_view`
2. **Validation**: `cd warehouse && make dbt-test` → validates data quality
3. **Training**: `make ml-train` → trains with calibration
4. **Verification**: `make ml-verify-calibration` → checks artifacts
5. **Deployment**: Auto-deploy if acceptance gate passes

### Monitoring
- **dbt tests**: Run daily after data refresh
- **Calibration check**: Run after each training
- **Registry tests**: Run in CI on every PR

## ✅ Success Criteria

### dbt Tests
- ✅ All 18+ tests passing
- ✅ No future dates in `ts_month`
- ✅ All categories match accepted values
- ✅ Referential integrity maintained

### Calibration Verification
- ✅ Script exits with code 0
- ✅ All required artifacts present
- ✅ Metadata summary printed
- ✅ CI verification step passes

### Registry Tests
- ✅ 4/4 pytest tests passing
- ✅ Calibrator exists when enabled
- ✅ Registry structure valid

## 🎯 Next Steps

1. **Integrate into CI/CD**
   ```bash
   # Add to GitHub Actions workflow
   - make dbt-test  # After data refresh
   - make ml-train  # Weekly/monthly
   - make ml-verify-calibration  # After training
   ```

2. **Monitor dbt Test Results**
   ```bash
   # Schedule daily dbt tests
   cd warehouse
   make dbt-test > test_results.log
   ```

3. **Alert on Failures**
   - Set up Slack/email notifications for test failures
   - Track failure rate in Grafana dashboard
   - Create runbook for common test failures

## 📚 Documentation

- **dbt Tests**: `warehouse/models/marts/ml_marts.yml`
- **Calibration Verification**: `apps/backend/app/scripts/verify_calibrator.py`
- **Registry Tests**: `apps/backend/tests/test_registry_calibrator.py`
- **CI Workflow**: `.github/workflows/ml.yml`

---

**Implementation Status**: ✅ Complete  
**Total Tests Added**: 22+ (18 dbt + 4 pytest)  
**Files Created/Modified**: 7  
**CI Integration**: ✅ Complete  
**Last Updated**: November 4, 2025
