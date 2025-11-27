# ML Suggestions Enhancement - Implementation Summary

**Date:** November 4, 2025
**Branch:** website-cleaning
**Status:** ✅ Ready for deployment

## Overview

Implemented 5 major enhancements to the ML suggestions system:

1. ✅ **dbt Feedback Mart** - Accept/reject rate analytics
2. ✅ **Model Registry** - Track ML model versions and deployment phases
3. ✅ **Per-Tenant Canary Knobs** - DB-driven canary percentage overrides
4. ✅ **UI Polish** - Enhanced confidence badges and undo functionality
5. ✅ **LightGBM Trainer CI** - Automated weekly model training

---

## 1. dbt Feedback Mart

### Files Created/Modified
- `warehouse/models/marts/mart_suggestions_feedback_daily.sql` - Daily feedback aggregates
- `warehouse/models/marts/mart_suggestions_feedback_daily.yml` - Mart tests
- `warehouse/models/marts/mart_suggestions_kpis.sql` - Updated with accept_rate
- `warehouse/models/marts/mart_suggestions_kpis.yml` - Updated schema
- `warehouse/models/sources.yml` - Added suggestion_feedback source

### Features
- **Daily aggregates** by mode and model_id:
  - Accept/reject/undo counts
  - Accept rate calculation: `accepts / (accepts + rejects)`
- **KPI rollups** with overall accept_rate across all feedback
- **Cross-platform compatibility** (BigQuery + Postgres)

### Usage
```bash
cd warehouse
dbt deps
dbt run --select marts
dbt test --select marts
```

### Grafana Query Example
```sql
SELECT
  created_date,
  mode,
  accept_rate
FROM mart_suggestions_feedback_daily
WHERE created_date >= CURRENT_DATE - 30
ORDER BY created_date DESC
```

---

## 2. Model Registry

### Files Created
- `apps/backend/alembic/versions/20251104_model_registry.py` - Migration
- `apps/backend/app/models/model_registry.py` - SQLAlchemy model
- `apps/backend/app/services/suggest/registry.py` - Registry helper functions

### Files Modified
- `apps/backend/app/services/suggest/serve.py` - Auto-register models on load
- `warehouse/models/sources.yml` - Added model_registry source

### Database Schema
```sql
CREATE TABLE model_registry (
  id SERIAL PRIMARY KEY,
  model_id VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL,
  notes TEXT,
  commit_sha VARCHAR,
  artifact_uri VARCHAR,
  phase VARCHAR  -- 'shadow', 'canary', 'live'
);
```

### Features
- **Automatic registration** when models are loaded
- **Phase tracking** (shadow → canary → live)
- **Metadata storage** (commit SHA, artifact URI, notes)
- **dbt source** for joining with suggestion events

### Usage
Models are automatically registered when loaded:
```python
# In serve.py, after model is loaded:
ensure_model_registered(_model_id, phase="shadow")
```

---

## 3. Per-Tenant Canary Knobs

### Files Created
- `apps/backend/alembic/versions/20251104_tenants_canary_pct.py` - Migration

### Files Modified
- `apps/backend/app/services/suggest/serve.py` - Tenant-specific canary logic

### Database Schema
```sql
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL,
  suggest_canary_pct INTEGER  -- Per-tenant override (0-100)
);

ALTER TABLE transactions
  ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
```

### Features
- **Tenant-specific overrides** for canary percentage
- **Fallback to global setting** if tenant has no override
- **Per-transaction routing** based on tenant_id

### Usage
Set tenant-specific canary percentage:
```sql
-- Enable 50% canary for tenant 1
UPDATE tenants SET suggest_canary_pct = 50 WHERE id = 1;

-- Disable canary for tenant 2 (force heuristic)
UPDATE tenants SET suggest_canary_pct = 0 WHERE id = 2;

-- Use global setting for tenant 3
UPDATE tenants SET suggest_canary_pct = NULL WHERE id = 3;
```

### Logic Flow
```python
# Effective canary percentage determination:
tenant_pct = db.query("SELECT suggest_canary_pct FROM tenants WHERE id = :tid")
eff_pct = tenant_pct if tenant_pct is not None else settings.SUGGEST_CANARY_PCT

if random.randint(1, 100) <= eff_pct:
    use_model = True
    source = "canary"
```

---

## 4. UI Polish

### Files Modified
- `apps/web/src/components/SuggestionChip.tsx` - Enhanced confidence badges
- `apps/web/src/components/TransactionRowWithSuggestions.tsx` - Added undo functionality

### Features

#### Enhanced Confidence Badges
- **Color-coded by confidence**:
  - High (≥75%): Emerald green with `border-emerald-500/50`
  - Medium (<75%): Slate gray with `border-slate-300/40`
- **Prominent badge styling**: Confidence % in colored pill
- **Hover effects**: Border darkens on hover

#### Undo Functionality
- **Persistent event tracking**: Stores last event_id in localStorage
- **Undo button**: Appears after accepting a suggestion
- **Feedback API**: Sends "undo" action to backend
- **Category restoration**: Restores previous category (if available)
- **Error handling**: Toast notifications for success/failure

### Usage
```typescript
// User accepts suggestion
onAccept() → stores event_id → updates category → toast "Category updated"

// User clicks "Undo last apply"
onUndo() → sends feedback(undo) → restores category → toast "Reverted last change"
```

### UI Preview
```
┌─────────────────────────────────────────────────────┐
│ Suggested:                                          │
│ ✨ Groceries [85%] ✓ ✗                             │
│ ✨ Food      [62%] ✓ ✗                             │
│ [Undo last apply]  ← New button                    │
└─────────────────────────────────────────────────────┘
```

---

## 5. LightGBM Trainer CI

### Files Created
- `.github/workflows/ml-train.yml` - GitHub Action for weekly training

### Existing Files (No changes needed)
- `apps/backend/app/ml/train_lightgbm.py` - Training script (already exists)

### GitHub Action Features
- **Weekly schedule**: Runs Mondays at 04:21 UTC
- **Manual trigger**: `workflow_dispatch` for on-demand training
- **Artifact upload**: Saves trained model with 30-day retention
- **Metadata output**: JSON summary of training run
- **PR comments**: Posts training results to PRs (if applicable)

### Workflow Steps
1. **Setup**: Python 3.11 + dependencies (lightgbm, joblib, pandas, scikit-learn)
2. **Train**: Run `train_lightgbm.py` with artifact output
3. **Upload**: Save model as GitHub artifact
4. **Report**: Print metadata and comment on PR

### Manual Promotion Steps

After successful training:

```bash
# 1. Download artifact from GitHub Actions
#    Go to: Actions → ml-train → Download artifact

# 2. Copy to server
docker cp lm-model.joblib backend:/app/data/models/

# 3. Enable shadow mode (24h observation)
export SUGGEST_SHADOW=true
export SUGGEST_MODEL_PATH=/app/data/models/lm-model.joblib
docker compose -f docker-compose.prod.yml up -d backend

# 4. Monitor metrics (check Prometheus/Grafana)
curl http://localhost/metrics | grep lm_suggestions

# 5. If stable, enable canary rollout (10%)
export SUGGEST_MODE=auto
export SUGGEST_CANARY_PCT=10
docker compose -f docker-compose.prod.yml up -d backend

# 6. Gradual rollout: 10% → 25% → 50% → 100%
# Monitor accept_rate and error rates at each step

# 7. Promote to live
export SUGGEST_MODE=model
docker compose -f docker-compose.prod.yml up -d backend
```

---

## Deployment Steps

### 1. Rebuild Backend (includes new migrations)
```bash
docker compose -f docker-compose.prod.yml up -d --build backend
```

### 2. Run Migrations
```bash
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c /app/alembic.ini upgrade head
```

Expected migrations:
- ✅ `20251104_model_registry` - Create model_registry table
- ✅ `20251104_tenants_canary_pct` - Create tenants table + tenant_id column

### 3. Verify Backend Health
```bash
curl http://localhost/ready
# Expected: {"ok":true,"migrations":{"current":"20251104_tenants_canary_pct",...}}
```

### 4. Rebuild Frontend (includes UI updates)
```bash
cd apps/web
pnpm install
pnpm build
docker compose -f ../../docker-compose.prod.yml up -d --build agui
```

### 5. Build dbt Models (optional - requires warehouse connection)
```bash
cd warehouse
dbt deps
dbt run --select marts
dbt test
```

### 6. Verify Functionality

**Test suggestions with undo:**
```bash
# 1. Get suggestions for uncategorized transaction
curl http://localhost/ml/suggestions -d '{"txn_ids":["999001"]}'

# 2. Accept suggestion (note event_id from response)
curl http://localhost/ml/suggestions/feedback \
  -d '{"event_id":"<uuid>","action":"accept","reason":"test"}'

# 3. Test undo
curl http://localhost/ml/suggestions/feedback \
  -d '{"event_id":"<uuid>","action":"undo","reason":"test undo"}'
```

**Check model registry:**
```sql
SELECT * FROM model_registry ORDER BY created_at DESC LIMIT 5;
```

**Check tenants table:**
```sql
SELECT * FROM tenants;
```

---

## Monitoring & Metrics

### New Prometheus Queries

**Accept rate by mode:**
```promql
sum(rate(lm_suggestions_accept_total[30m])) by (label)
/
(sum(rate(lm_suggestions_accept_total[30m])) + sum(rate(lm_suggestions_reject_total[30m])))
```

**Undo rate:**
```promql
sum(rate(lm_suggestions_undo_total[30m]))
```

### dbt Mart Queries

**Weekly accept rate trend:**
```sql
SELECT
  DATE_TRUNC('week', created_date) AS week,
  AVG(accept_rate) AS avg_accept_rate
FROM mart_suggestions_feedback_daily
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;
```

**Model performance comparison:**
```sql
SELECT
  m.model_id,
  m.phase,
  f.accept_rate
FROM mart_suggestions_feedback_daily f
JOIN model_registry m ON f.model_id = m.model_id
WHERE f.created_date >= CURRENT_DATE - 7
ORDER BY f.accept_rate DESC;
```

---

## Testing

### Backend Tests
```bash
cd apps/backend
pytest tests/test_suggestions_api.py -v
```

### Frontend Tests
```bash
cd apps/web
pnpm test:fast tests/e2e/transactions-suggestions.spec.ts
```

### Smoke Test
```bash
.\apps\backend\scripts\test-suggestions-api.ps1
```

Expected output:
- ✅ Suggestions generated
- ✅ Accept feedback recorded
- ✅ Reject feedback recorded
- ✅ Metrics updated

---

## Rollback Plan

If issues arise:

### Rollback Migrations
```bash
# Rollback to before tenants
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c /app/alembic.ini downgrade 20251104_model_registry

# Rollback to before model_registry
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c /app/alembic.ini downgrade 20251103_suggestions_idx_created_at
```

### Rollback Code
```bash
git checkout <previous-commit>
docker compose -f docker-compose.prod.yml up -d --build backend agui
```

---

## Documentation Updates

### Files to Update (if needed)
- `docs/ML_SUGGESTIONS_DEPLOYMENT.md` - Add new features
- `warehouse/README.md` - Document new marts
- `apps/backend/README.md` - Document model registry

---

## Summary

All 5 enhancements are complete and ready for deployment:

1. ✅ **Feedback Mart**: Track accept/reject rates over time
2. ✅ **Model Registry**: Version tracking with phase management
3. ✅ **Tenant Canaries**: Per-tenant canary percentage overrides
4. ✅ **UI Polish**: Enhanced badges + undo functionality
5. ✅ **Trainer CI**: Weekly automated model training

**Next Steps:**
1. Deploy backend with migrations
2. Deploy frontend with UI updates
3. (Optional) Set up dbt warehouse connection
4. Monitor metrics for 24-48 hours
5. Enable first model training run manually or wait for Monday

**Estimated Impact:**
- Better observability into model performance (feedback mart)
- Controlled model rollouts (registry + tenant canaries)
- Improved UX (confidence badges + undo)
- Automated model retraining (weekly CI)
