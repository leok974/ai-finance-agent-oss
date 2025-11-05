# ML Scorer Integration Guide

This document describes how to enable and test the ML-based categorization scorer.

## Overview

The categorization system uses a multi-signal ranking algorithm with these scorers:

1. **Hints** (0.65) - User intent from natural language
2. **Rules** (0.60) - Regex pattern matches
3. **Recurring** (0.55) - Historical transaction patterns
4. **ML** (0.50) - Machine learning predictions
5. **Amount** (0.15) - Amount-based heuristics

By default, ML scoring is **disabled**. This guide shows how to enable it.

## Prerequisites

- Backend container running
- Demo transactions seeded (see `seed_txns_demo.py`)
- Categories and rules seeded

## Enabling ML Scorer

### Method 1: Environment Variables (Recommended)

Add to `secrets/backend.env` or your compose environment:

```bash
ML_SUGGEST_ENABLED=1
ML_SUGGEST_MODEL_PATH=/app/data/ml_suggest.joblib
```

Then recreate the backend:

```powershell
docker compose up -d --no-deps --force-recreate backend
```

### Method 2: Runtime Configuration

Some endpoints may support runtime toggles (check backend docs).

## Verifying ML Status

```powershell
curl -s http://localhost:8000/agent/tools/ml/status | ConvertFrom-Json
```

Expected response:
```json
{
  "enabled": true,
  "model_path": "/app/data/ml_suggest.joblib",
  "model_exists": false,
  "trained_categories": 0,
  "last_trained": null
}
```

## Training the Model

The ML model learns from applied categorizations. To train:

### 1. Seed demo transactions
```powershell
$IDS = docker compose exec -T backend python -m app.scripts.seed_txns_demo | ConvertFrom-Json
```

### 2. Apply categorizations
```powershell
# Example: Categorize SPOTIFY transaction
$spotifyId = $IDS[0]
$body = @{ category_slug = "subscriptions.streaming" } | ConvertTo-Json
curl -s -X POST "http://localhost:8000/txns/$spotifyId/categorize" `
  -H "Content-Type: application/json" `
  -d $body | ConvertFrom-Json
```

### 3. Test ML predictions

After applying a few categorizations, the model will start making predictions:

```powershell
# Run batch suggest again
$body = @{ txn_ids = $IDS } | ConvertTo-Json
curl -s -X POST "http://localhost:8000/agent/tools/categorize/suggest/batch" `
  -H "Content-Type: application/json" `
  -d $body | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

Look for `why` entries containing "ml scorer p=..." in the results.

## ML Model Management

### View model info
```powershell
docker compose exec -T backend python -m app.scripts.ml_model_tools info
```

### Wipe model (forces retraining)
```powershell
make ml-wipe
# or
docker compose exec -T backend python -m app.scripts.ml_model_tools wipe
```

### Complete reset (wipe + reseed)
```powershell
make ml-reseed
# or
.\scripts\ml-reseed.ps1
```

## Feature Engineering

The ML scorer uses an 8-dimensional feature vector:

1. **Keyword Toggles** (binary features)
   - `has_recurring_keyword` - words like "monthly", "subscription", etc.
   - `has_transport_keyword` - "uber", "lyft", "taxi", etc.
   - `has_food_keyword` - "restaurant", "cafe", etc.
   - `has_utility_keyword` - "electric", "water", "internet", etc.
   - `has_shopping_keyword` - "amazon", "walmart", etc.

2. **Amount Bands** (one-hot encoded)
   - Small: < $20
   - Medium: $20-100
   - Large: > $100

3. **Text Features** (TF-IDF on merchant + description)

## Testing ML Integration

Use the comprehensive smoke test script:

```powershell
.\scripts\categorize-smoke.ps1 -EnableML
```

This will:
1. ✓ Verify DNS/network setup
2. ✓ Seed demo transactions
3. ✓ Test batch categorization
4. ✓ Test promote to rule
5. ✓ Train ML model with one example
6. ✓ Re-run batch to see ML predictions

## Troubleshooting

### ML model not loading
- Check `ML_SUGGEST_MODEL_PATH` points to writable directory
- Verify `/app/data` volume is mounted
- Check backend logs for sklearn/joblib errors

### No ML predictions appearing
- ML scorer only activates after model is trained
- Apply at least 5-10 categorizations to train
- Check `ml/status` endpoint shows `trained_categories > 0`

### Model file too large
- Model grows with training examples
- Periodically run `make ml-wipe` to reset
- Consider ML model versioning in production

### Stale predictions
- Model doesn't auto-retrain by default
- Run `make ml-reseed` to start fresh
- Check if incremental learning is enabled

## Production Considerations

1. **Model Persistence**: Mount `/app/data` to persistent volume
2. **Training Strategy**: Batch training vs incremental learning
3. **Model Versioning**: Track model changes with git or registry
4. **Performance**: ML scoring adds ~50-100ms per batch
5. **Monitoring**: Track prediction accuracy over time

## Next Steps

- Wire AdminRulesPanel to batch suggestions display
- Add ML confidence threshold tuning
- Implement model performance metrics
- Add A/B testing for ML vs rule-based ranking
