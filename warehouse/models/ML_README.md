# ML Training Data Models

This directory contains dbt models for ML training infrastructure, including feature extraction, labeling, and model evaluation.

## Model Lineage

```
Sources (PostgreSQL)
├── transactions
├── transaction_labels
├── ml_features
├── ml_training_runs
├── suggestion_events
└── suggestion_feedback

Staging Layer
├── stg_transactions.sql         → Clean transaction data
├── stg_transaction_labels.sql   → Golden truth labels
└── stg_ml_features.sql          → Point-in-time features

Marts Layer
├── fct_training_view.sql        → Training dataset (features + labels)
├── dim_merchants.sql            → Merchant priors for heuristics
└── fct_suggestions_eval.sql     → Model evaluation (predictions vs truth)
```

## Key Models

### `fct_training_view`
**Purpose**: Complete training dataset with features joined to labels.

**Key Features**:
- ✅ **Leakage Prevention**: Uses `ts_month` buckets for temporal splits
- ✅ **Quality Filters**: Requires merchant, non-zero amount, valid label
- ✅ **Label Weighting**: `label_source` field for sample weighting (human > rule > import)

**Usage**:
```sql
-- Train on data before October 2025, test on October
SELECT * FROM fct_training_view
WHERE ts_month < '2025-10-01'  -- Training set
-- WHERE ts_month = '2025-10-01'  -- Test set
```

**Temporal Split Strategy**:
```python
# Example Python training code
train_months = df[df['ts_month'] < '2025-10-01']
test_months = df[df['ts_month'] >= '2025-10-01']
```

### `dim_merchants`
**Purpose**: Merchant-level statistics for heuristic rules and Bayesian priors.

**Provides**:
- **Category Priors**: `P(category|merchant)` probabilities
- **Confidence Levels**: high/medium/low based on sample count
- **Subscription Detection**: Merchants with recurring patterns
- **Human Label Quality**: Tracks human vs rule labels

**Usage**:
```sql
-- Get best category for a merchant (heuristic rule)
SELECT category, category_prior, confidence
FROM dim_merchants
WHERE merchant_name = 'STARBUCKS'
ORDER BY transaction_count DESC
LIMIT 1
```

### `fct_suggestions_eval`
**Purpose**: Model evaluation by comparing predictions with ground truth.

**Tracks**:
- Suggestion events (heuristic vs model predictions)
- User feedback (accept/reject)
- True labels (ground truth)
- Computed metrics (is_correct_accept, is_correct_reject)

**Usage**:
```sql
-- Model performance by mode (heuristic vs ML)
SELECT 
  suggestion_mode,
  COUNT(*) as suggestions,
  SUM(is_accepted) as accepted,
  AVG(is_accepted) as acceptance_rate,
  SUM(is_correct_accept) / NULLIF(SUM(is_accepted), 0) as precision
FROM fct_suggestions_eval
WHERE suggested_at >= '2025-10-01'
GROUP BY suggestion_mode
```

## Data Quality Tests

All models include dbt tests for:
- **Uniqueness**: Primary keys are unique
- **Not Null**: Required fields are populated
- **Referential Integrity**: Foreign keys exist in parent tables
- **Accepted Values**: Enums match expected values
- **Relationships**: Joins are valid

Run tests with:
```bash
dbt test --select tag:ml
```

## Leakage Prevention

**Critical Design Decision**: All features in `ml_features` are **point-in-time**.

### What This Means:
- Features represent data available **at transaction time**
- No future information is used (e.g., no "merchant total from last 30 days" computed today)
- `ts_month` field buckets features by month (yyyy-mm-01) for temporal splits

### Why This Matters:
```sql
-- ❌ WRONG: Data leakage (computes merchant stats using ALL data)
SELECT merchant, COUNT(*) as merchant_total
FROM transactions
GROUP BY merchant

-- ✅ CORRECT: Point-in-time (only uses data BEFORE transaction date)
SELECT merchant, ts_month, merchant_count_at_month
FROM ml_features
WHERE ts_month <= txn.date
```

### Safe Temporal Splits:
```python
# Split by ts_month for walk-forward validation
for split_month in ['2025-08-01', '2025-09-01', '2025-10-01']:
    train = df[df['ts_month'] < split_month]
    test = df[df['ts_month'] == split_month]
    # Train and evaluate...
```

## Refresh Schedule

| Model | Materialization | Refresh | Reason |
|-------|----------------|---------|--------|
| `stg_*` | view | on-demand | Lightweight, always fresh |
| `fct_training_view` | table | daily | Large joins, used in training |
| `dim_merchants` | table | daily | Aggregations, rarely changes |
| `fct_suggestions_eval` | incremental | hourly | Evaluation monitoring |

## Integration with ML Pipeline

### 1. Feature Extraction
```bash
# Build features for last 180 days
docker compose exec backend python -m app.ml.feature_build --days 180

# Or in dbt model (if using dbt Python models)
# model: stg_ml_features_computed
# This would call the feature builder as part of dbt run
```

### 2. Training Data Export
```bash
# Export training data to CSV
dbt run --select fct_training_view
dbt run-operation export_to_csv --args '{model: fct_training_view, path: /tmp/train.csv}'
```

### 3. Model Training
```python
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# Load from warehouse
df = pd.read_sql("SELECT * FROM fct_training_view", conn)

# Split by time
train = df[df['ts_month'] < '2025-10-01']
test = df[df['ts_month'] >= '2025-10-01']

# Weight samples by label source
sample_weight = train['label_source'].map({
    'human': 3.0,
    'rule': 1.0,
    'import': 0.5
})

# Train
X_train = train[feature_cols]
y_train = train['target_label']
clf = RandomForestClassifier()
clf.fit(X_train, y_train, sample_weight=sample_weight)

# Evaluate
y_pred = clf.predict(test[feature_cols])
```

### 4. Model Evaluation
```sql
-- After deploying model, track performance
INSERT INTO ml_training_runs (...)
VALUES (...);

-- Monitor in Grafana/Looker via fct_suggestions_eval
SELECT 
  DATE_TRUNC('day', suggested_at) as date,
  suggestion_mode,
  AVG(is_accepted) as acceptance_rate
FROM fct_suggestions_eval
GROUP BY 1, 2
ORDER BY 1 DESC
```

## Example Queries

### Training Set Statistics
```sql
SELECT 
  ts_month,
  label_source,
  COUNT(*) as sample_count,
  COUNT(DISTINCT target_label) as unique_labels,
  AVG(abs_amount) as avg_amount
FROM fct_training_view
GROUP BY 1, 2
ORDER BY 1 DESC
```

### Label Quality Metrics
```sql
SELECT 
  target_label as category,
  COUNT(*) as total_samples,
  SUM(CASE WHEN label_source = 'human' THEN 1 ELSE 0 END) as human_labels,
  AVG(CASE WHEN label_source = 'human' THEN 1.0 ELSE 0.0 END) as human_ratio
FROM fct_training_view
GROUP BY 1
ORDER BY 2 DESC
```

### Merchant Heuristic Performance
```sql
WITH merchant_rules AS (
  SELECT 
    merchant_name,
    category as predicted_category,
    category_prior as confidence
  FROM dim_merchants
  WHERE confidence = 'high'
),
actuals AS (
  SELECT 
    merchant,
    target_label as actual_category
  FROM fct_training_view
)
SELECT 
  mr.merchant_name,
  mr.predicted_category,
  COUNT(*) as prediction_count,
  SUM(CASE WHEN mr.predicted_category = a.actual_category THEN 1 ELSE 0 END) as correct,
  AVG(CASE WHEN mr.predicted_category = a.actual_category THEN 1.0 ELSE 0.0 END) as accuracy
FROM merchant_rules mr
JOIN actuals a ON mr.merchant_name = a.merchant
GROUP BY 1, 2
HAVING COUNT(*) >= 5
ORDER BY accuracy DESC, prediction_count DESC
```

## Troubleshooting

### Issue: Missing features for labeled transactions
```sql
-- Find labeled transactions without features
SELECT l.txn_id, t.txn_date, t.merchant
FROM transaction_labels l
JOIN transactions t ON l.txn_id = t.id
LEFT JOIN ml_features f ON l.txn_id = f.txn_id
WHERE f.txn_id IS NULL
```

**Solution**: Run feature builder for missing date range
```bash
docker compose exec backend python -m app.ml.feature_build --start-date 2025-01-01 --end-date 2025-12-31
```

### Issue: dbt tests failing
```bash
# Check which tests are failing
dbt test --select tag:ml --store-failures

# Inspect failures
SELECT * FROM dbt_test_failures.not_null_fct_training_view_target_label
```

### Issue: Incremental model not updating
```bash
# Force full refresh
dbt run --select fct_suggestions_eval --full-refresh
```

## Future Enhancements

- [ ] Add `fct_model_drift` for monitoring feature distributions over time
- [ ] Create `rpt_model_performance` for executive reporting
- [ ] Add dbt snapshots for label changes (audit trail)
- [ ] Implement dbt Python models for feature engineering
- [ ] Add data quality sensors (Great Expectations)

## References

- Feature builder script: `apps/backend/app/ml/feature_build.py`
- ORM models: `apps/backend/app/ml/models.py`
- Migration: `apps/backend/alembic/versions/84517dc3bc96_add_ml_training_tables.py`
