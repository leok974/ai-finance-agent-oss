# Phase 2 ML Shadow + Canary - Deployment Summary

**Date**: 2025-11-04  
**Status**: ✅ READY FOR DEPLOYMENT

## What Changed

### 1. Shadow Mode Integration
- **File**: `apps/backend/app/services/suggest/serve.py`
- **Change**: Every suggestion request now runs BOTH rule engine AND ML model
- **Metrics**: Tracks agreement between rules and model via `lm_suggest_compare_total{agree}`
- **Impact**: Zero user-facing changes (rules still returned)

### 2. Canary Deployment Support
- **Environment Variable**: `SUGGEST_USE_MODEL_CANARY`
- **Values**: `0` (rules only), `1` (model only), `10%` (gradual rollout)
- **Stickiness**: Per-user consistent via SHA1 hash of user_id

### 3. Monitoring Enhancements
- **Alert Added**: `SuggestAgreementDrop` (fires if agreement <75% for 30m)
- **Dashboard**: Existing Grafana dashboard already has agreement panels
- **Metrics**: 3 new counters tracking predictions, agreement, and source

### 4. Testing
- **E2E Tests**: `apps/web/tests/ml-smoke.spec.ts` (3 tests)
- **NPM Script**: `pnpm test:ml-smoke`
- **Coverage**: Status check, training (tolerant), predictions, metrics

## Files Modified

```
apps/backend/app/services/suggest/serve.py       # Shadow + canary logic
apps/backend/app/routers/suggestions.py          # user_id extraction
apps/web/tests/ml-smoke.spec.ts                  # NEW: Playwright tests
apps/web/package.json                            # NEW: test:ml-smoke script
prometheus/rules/ml_alerts.yml                   # NEW: Agreement alert
PHASE2_SHADOW_CANARY.md                          # NEW: Documentation
```

## Pre-Deployment Checklist

- [x] Shadow mode code integrated
- [x] Metrics tracked and primed
- [x] Grafana dashboard has agreement panels
- [x] Prometheus alert configured
- [x] Playwright smoke tests created
- [x] Documentation complete

## Deployment Steps

### 1. Deploy Code (Zero User Impact)

```bash
# Rebuild backend with shadow mode
docker compose -f docker-compose.prod.yml build backend

# Restart backend (shadow mode active, rules still returned)
docker compose -f docker-compose.prod.yml up -d backend

# Verify backend started
docker compose -f docker-compose.prod.yml logs backend --tail=50
```

**Expected**: Backend starts normally, no errors

### 2. Verify Shadow Mode Active

```bash
# Check model status
curl http://localhost:8000/ml/v2/model/status | jq

# Generate suggestion (triggers shadow prediction)
curl -X POST http://localhost:8000/ml/suggestions \
  -H 'Content-Type: application/json' \
  -d '{"txn_ids": [88]}' | jq

# Verify metrics appeared
curl -s http://localhost:8000/metrics | grep -E "lm_ml_predict|lm_suggest_"
```

**Expected**:
- `lm_ml_predict_requests_total{available="True"}` or `available="False"` increments
- `lm_suggest_compare_total{agree="True"/"False"}` increments (if model available)
- `lm_suggest_source_total{source="rule"}` increments

### 3. Run Smoke Tests

```bash
cd apps/web
pnpm test:ml-smoke
```

**Expected**: 3 tests pass (status, suggestions, prediction)

### 4. Monitor Agreement Rate

**Grafana Dashboard**: `http://localhost:3000/d/ml-suggest-3311af`

**Key Panels**:
- **Agreement Rate (Gauge)**: Should show >75% if model quality good
- **Suggestions by Source**: Should show 100% rule (canary=0)
- **Model Availability**: Should show 100% if model deployed

### 5. Analyze Shadow Mode (48-72 hours)

**Questions to Answer**:
1. What is the average agreement rate?
2. Which transaction types have low agreement?
3. Is model consistently available?
4. Are there performance issues (latency)?

**Queries**:
```promql
# Agreement over 24h
sum(increase(lm_suggest_compare_total{agree="True"}[24h])) /
sum(increase(lm_suggest_compare_total[24h]))

# Disagreement examples (requires logging enhancement)
# Log transactions where agree="False" for manual review
```

## Post-Shadow Analysis

### Decision Matrix

| Agreement Rate | Action |
|---------------|--------|
| ≥85% | ✅ Proceed to 10% canary |
| 75-85% | ⚠️ Review disagreements, may proceed with caution |
| <75% | ❌ Investigate model quality, retrain before canary |

### If Agreement is Low (<75%)

1. **Export disagreements**:
   ```sql
   SELECT se.txn_id, se.candidates, t.description, t.merchant, t.amount
   FROM suggestion_events se
   JOIN transactions t ON t.id = se.txn_id
   WHERE se.model_id LIKE 'lgbm%'
   AND JSON_EXTRACT(se.candidates, '$[0].label') != t.category
   LIMIT 100;
   ```

2. **Analyze patterns**:
   - Are disagreements clustered by merchant?
   - Specific categories poorly predicted?
   - Model predicting "Unknown" too often?

3. **Retrain with adjustments**:
   - Add more labeled data for weak categories
   - Tune hyperparameters (learning rate, trees)
   - Add merchant embeddings

## Canary Rollout (After Shadow Analysis)

### Phase 1: 10% Canary

```bash
# Set environment variable
export SUGGEST_USE_MODEL_CANARY=10%

# Restart backend
docker compose -f docker-compose.prod.yml restart backend

# Verify canary active
curl -s http://localhost:8000/metrics | grep lm_suggest_source_total
```

**Monitor for 3-7 days**:
- User accept/reject rates by source
- Model error rates
- Latency P95/P99
- User feedback/complaints

### Phase 2: Incremental Rollout

If metrics healthy:
- **Week 2**: 25% canary
- **Week 3**: 50% canary
- **Week 4**: 100% canary (or back to 0% if issues)

### Rollback Procedure

```bash
# Immediate rollback to rules
export SUGGEST_USE_MODEL_CANARY=0
docker compose -f docker-compose.prod.yml restart backend

# Verify rollback
curl -s http://localhost:8000/metrics | grep lm_suggest_source_total
# Should show only source="rule" incrementing
```

## Troubleshooting

### Backend won't start after deployment

**Check logs**:
```bash
docker compose -f docker-compose.prod.yml logs backend --tail=100
```

**Common issues**:
- Import error: `from app.ml.feature_build import normalize_description`
  - Fix: Ensure `feature_build.py` has the function
- Metric already registered
  - Fix: Restart all backend replicas (not just one)

### Metrics not showing in Grafana

1. **Check Prometheus scraping**:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

2. **Verify metrics endpoint**:
   ```bash
   curl -s http://localhost:8000/metrics | grep lm_suggest_compare_total
   ```

3. **Reload Prometheus** (if rules updated):
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

### Agreement rate calculation error

**Symptom**: Grafana shows "NaN" or infinity

**Cause**: Division by zero (no suggestions made yet)

**Fix**: Query uses `clamp_min(..., 1e-9)` to prevent division by zero. Check query syntax.

## Success Criteria

✅ **Shadow Mode Complete** when:
- Agreement rate stable for 48h
- No performance degradation (P95 latency <200ms)
- Model availability >95%
- Prometheus alert not firing

✅ **Canary Complete** when:
- User satisfaction metrics unchanged (or improved)
- Model prediction accuracy ≥ rule accuracy
- No increase in error rates
- Zero critical incidents

## Contacts

- **ML Pipeline Owner**: [Your Name]
- **On-Call Rotation**: [Team Pager]
- **Slack Channel**: `#ml-suggestions`
- **Runbook**: `PHASE2_SHADOW_CANARY.md`

## Quick Commands Reference

```bash
# Check shadow mode metrics
curl -s http://localhost:8000/metrics | grep -E "lm_suggest_compare|lm_ml_predict"

# Get suggestion (triggers shadow)
curl -X POST http://localhost:8000/ml/suggestions \
  -H 'Content-Type: application/json' \
  -d '{"txn_ids": [88]}'

# Check model status
make ml-status

# Train new model
make ml-train

# Run smoke tests
cd apps/web && pnpm test:ml-smoke

# Rollback canary
export SUGGEST_USE_MODEL_CANARY=0
docker compose -f docker-compose.prod.yml restart backend
```

---

**Next Steps**:
1. Deploy code (shadow mode)
2. Monitor for 48-72h
3. Analyze agreement metrics
4. Decision: proceed to canary or retrain
5. 10% → 50% → 100% gradual rollout

**Documentation**: See `PHASE2_SHADOW_CANARY.md` for detailed architecture and rollout procedures.
