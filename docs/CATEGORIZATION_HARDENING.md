# Categorization System - Production Hardening Summary

## Changes Implemented

### 1. Docker Compose Networking Hardening ✅

**Problem**: Unstable DNS resolution between backend and postgres services could cause intermittent connection failures.

**Solution**: Added explicit postgres hostname alias on shared-ollama network in both compose files.

#### Files Modified:
- `docker-compose.yml`
- `docker-compose.prod.yml`

#### Changes:
```yaml
services:
  postgres:
    networks:
      shared-ollama:
        aliases:
          - postgres  # ensures "postgres" resolves reliably

  backend:
    networks:
      - shared-ollama
    environment:
      DATABASE_URL: postgresql+psycopg://myuser:pass@postgres:5432/finance
```

#### Verification Commands:
```powershell
# Recreate backend for fresh DNS state
docker compose up -d --force-recreate --no-deps backend

# Test DNS resolution
docker compose exec backend sh -c "getent hosts postgres"

# Test Python socket resolution
docker compose exec backend python -c "import socket; print(socket.gethostbyname('postgres'))"
```

### 2. Demo Transaction Seeding Script ✅

**Purpose**: Seed realistic demo transactions with known merchants for testing batch categorization.

#### File Created:
- `apps/backend/app/scripts/seed_txns_demo.py`

#### Demo Data:
| Date | Merchant | Description | Amount |
|------|----------|-------------|--------|
| 2025-08-12 | SPOTIFY | Premium Monthly | -$12.99 |
| 2025-08-14 | UBER | Trip 3.2mi | -$18.50 |
| 2025-08-18 | STARBUCKS | Latte | -$5.45 |
| 2025-08-20 | COMCAST | Internet | -$79.99 |
| 2025-08-22 | DELTA AIR | Flight DCA→PIT | -$156.40 |
| 2025-08-24 | SHELL | Fuel | -$42.13 |

#### Usage:
```powershell
# Seed transactions and capture IDs
$IDS = docker compose exec -T backend python -m app.scripts.seed_txns_demo | ConvertFrom-Json
Write-Host "Seeded transaction IDs: $($IDS -join ', ')"

# Test batch categorization
$body = @{ txn_ids = $IDS } | ConvertTo-Json
curl -s -X POST http://localhost:8000/agent/tools/categorize/suggest/batch `
  -H "Content-Type: application/json" `
  -d $body | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### 3. Comprehensive Smoke Test Script ✅

**Purpose**: Automated testing of all categorization system components.

#### File Created:
- `scripts/categorize-smoke.ps1`

#### Test Coverage:
1. ✅ Network & DNS sanity checks
2. ✅ Demo transaction seeding
3. ✅ Batch categorization with real transaction IDs
4. ✅ Promote to rule endpoint
5. ✅ Optional: ML scorer integration testing

#### Usage:
```powershell
# Basic smoke tests
.\scripts\categorize-smoke.ps1

# With ML scorer testing
.\scripts\categorize-smoke.ps1 -EnableML

# Production compose file
.\scripts\categorize-smoke.ps1 -ComposeFile docker-compose.prod.yml
```

### 4. ML Integration Documentation ✅

**Purpose**: Complete guide for enabling and testing ML-based categorization scorer.

#### File Created:
- `docs/ML_INTEGRATION.md`

#### Contents:
- Overview of multi-signal ranking algorithm
- Step-by-step ML enablement instructions
- Model training workflow
- ML model management commands
- Feature engineering details
- Troubleshooting guide
- Production considerations

## Testing Checklist

### Network Hardening
- [ ] Run `docker compose up -d --force-recreate backend`
- [ ] Verify DNS: `docker compose exec backend getent hosts postgres`
- [ ] Verify Python: `docker compose exec backend python -c "import socket; print(socket.gethostbyname('postgres'))"`

### Demo Transactions
- [ ] Run seed script: `$IDS = docker compose exec -T backend python -m app.scripts.seed_txns_demo | ConvertFrom-Json`
- [ ] Verify 6 IDs returned
- [ ] Check transactions in database

### Batch Categorization
- [ ] Test with seeded IDs: `$body = @{ txn_ids = $IDS } | ConvertTo-Json`
- [ ] POST to `/agent/tools/categorize/suggest/batch`
- [ ] Verify suggestions for all 6 transactions
- [ ] Check expected categories:
  - SPOTIFY → `subscriptions.streaming`
  - UBER → `transportation.ride_hailing`
  - COMCAST → `housing.utilities.internet`
  - SHELL → `transportation.fuel`

### Promote to Rule
- [ ] POST to `/agent/tools/categorize/promote`
- [ ] Body: `{ merchant_canonical: "netflix", category_slug: "subscriptions.streaming", priority: 35 }`
- [ ] Verify rule appears in GET `/agent/tools/categorize/rules`

### ML Scorer (Optional)
- [ ] Set `ML_SUGGEST_ENABLED=1` in backend env
- [ ] Recreate backend: `docker compose up -d --force-recreate backend`
- [ ] Check status: `curl http://localhost:8000/agent/tools/ml/status`
- [ ] Apply one categorization to train model
- [ ] Re-run batch suggest, verify ML scorer in `why` field

### Comprehensive Smoke Test
- [ ] Run `.\scripts\categorize-smoke.ps1`
- [ ] All sections pass (Network, Seed, Batch, Promote)
- [ ] Optional: Run with `-EnableML` flag

## Quick Reference Commands

```powershell
# Network sanity check
docker compose up -d --force-recreate backend
docker compose exec backend sh -c "getent hosts postgres || echo FAIL"

# Seed demo transactions
$IDS = docker compose exec -T backend python -m app.scripts.seed_txns_demo | ConvertFrom-Json

# Batch categorize
$body = @{ txn_ids = $IDS } | ConvertTo-Json
curl -s -X POST http://localhost:8000/agent/tools/categorize/suggest/batch `
  -H "Content-Type: application/json" -d $body | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Promote to rule
curl -s -X POST http://localhost:8000/agent/tools/categorize/promote `
  -H "Content-Type: application/json" `
  -d '{"merchant_canonical":"netflix","category_slug":"subscriptions.streaming","priority":35}' | ConvertFrom-Json

# List all rules
curl -s http://localhost:8000/agent/tools/categorize/rules | ConvertFrom-Json

# ML model management
make ml-wipe       # Remove model file
make ml-reseed     # Complete reset (wipe + reseed)
docker compose exec -T backend python -m app.scripts.ml_model_tools info

# Comprehensive smoke test
.\scripts\categorize-smoke.ps1
.\scripts\categorize-smoke.ps1 -EnableML
```

## System Status Snapshot

```json
{
  "stack": {
    "backend": "healthy",
    "postgres": "healthy",
    "network": "shared-ollama (compose-defined with postgres alias)"
  },
  "categorize": {
    "rules": "seeded (33 categories + 10 rules)",
    "categories": "seeded",
    "single_suggest": "ok",
    "batch_suggest": "ready (ID-based)",
    "promote": "ready"
  },
  "ml": {
    "enabled": false,
    "model_path": "/app/data/ml_suggest.joblib",
    "enable_via": "ML_SUGGEST_ENABLED=1 in backend env"
  },
  "admin": {
    "rules_panel": "ready (Dev menu → Admin: Category Rules)",
    "crud_endpoints": "ready (GET/PATCH/DELETE/POST)",
    "regex_tester": "ready"
  },
  "next": [
    "Run categorize-smoke.ps1 to verify all components",
    "Wire React panel to batch suggestions map",
    "Enable ML when you want learning on",
    "Use Admin Rules panel to tune regex & priority"
  ]
}
```

## Production Deployment Notes

### Before Deploying

1. **Test networking**: Run smoke tests with prod compose file
   ```powershell
   .\scripts\categorize-smoke.ps1 -ComposeFile docker-compose.prod.yml
   ```

2. **Rebuild images**: Ensure latest code in containers
   ```powershell
   docker compose -f docker-compose.prod.yml build backend web
   ```

3. **Backup database**: Before running migrations or reseeds
   ```powershell
   docker compose exec postgres pg_dump -U myuser finance > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql
   ```

4. **Test rollback**: Verify you can restore from backup

### Deployment Steps

1. Pull latest code
2. Rebuild containers with new networking config
3. Run Alembic migrations (if any)
4. Recreate services with `--force-recreate`
5. Verify DNS resolution
6. Run smoke tests
7. Monitor backend logs for errors

### Monitoring

- Check backend health: `curl http://localhost:8000/healthz`
- Check ML status: `curl http://localhost:8000/agent/tools/ml/status`
- Monitor logs: `docker compose logs -f backend`
- Watch for DNS errors in logs

## Troubleshooting

### DNS Resolution Fails

**Symptoms**: Backend can't connect to postgres, errors like "could not translate host name"

**Solution**:
1. Verify network exists: `docker network ls | grep shared-ollama`
2. Recreate backend: `docker compose up -d --force-recreate backend`
3. Check network config: `docker network inspect shared-ollama`
4. Verify alias: Should see postgres in aliases list

### Batch Suggest Returns Empty

**Symptoms**: POST to `/batch` returns `{}` or errors

**Causes**:
- Transaction IDs don't exist in database
- Categories not seeded
- Rules not loaded

**Solution**:
1. Seed transactions: `python -m app.scripts.seed_txns_demo`
2. Verify IDs exist: `SELECT id FROM transactions;`
3. Reseed categories: `python -m app.scripts.seed_categories`
4. Check rules: `curl http://localhost:8000/agent/tools/categorize/rules`

### ML Model Not Training

**Symptoms**: ML status shows `trained_categories: 0` after applying categorizations

**Causes**:
- ML not enabled: `ML_SUGGEST_ENABLED=0` or not set
- Model path not writable
- sklearn/joblib errors in logs

**Solution**:
1. Enable ML: Set `ML_SUGGEST_ENABLED=1`
2. Check model path: `/app/data` should be writable
3. Check logs: `docker compose logs backend | grep -i ml`
4. Wipe and retry: `make ml-wipe`

## Files Modified/Created

### Modified
- ✅ `docker-compose.yml` - Added postgres hostname alias
- ✅ `docker-compose.prod.yml` - Added postgres hostname alias + network definitions

### Created
- ✅ `apps/backend/app/scripts/seed_txns_demo.py` - Demo transaction seeder
- ✅ `scripts/categorize-smoke.ps1` - Comprehensive smoke tests
- ✅ `docs/ML_INTEGRATION.md` - ML scorer documentation
- ✅ `docs/CATEGORIZATION_HARDENING.md` - This document

## Success Criteria

All tests passing in `categorize-smoke.ps1`:
- ✅ DNS resolution (getent + Python socket)
- ✅ Demo transactions seeded (6 IDs returned)
- ✅ Batch categorization (suggestions for all 6 txns)
- ✅ Promote to rule (netflix rule created)
- ✅ Optional: ML predictions (if enabled)

## Next Steps

1. **Run smoke tests**: `.\scripts\categorize-smoke.ps1`
2. **Test Admin Panel**: Open Dev menu → Admin: Category Rules
3. **Enable ML** (optional): Add `ML_SUGGEST_ENABLED=1` to backend env
4. **Production deploy**: Use hardened compose files
5. **Monitor**: Watch backend logs and health endpoints
