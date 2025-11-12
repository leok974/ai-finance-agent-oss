# ml_features.tokens Migration Deployment Checklist

## Overview
Convert `ml_features.tokens` from PostgreSQL `text[]` to `jsonb` for cross-database compatibility (SQLite + Postgres).

**Migration ID**: `502d44cd70ab_convert_ml_features_tokens_to_jsonb`

---

## Pre-Deployment (Read-Only Validation)

### 1. Check Current Schema
```bash
cd apps/backend
psql $DATABASE_URL -f scripts/validate_tokens_migration.sql
```

Or manually:
```sql
-- Should show: ARRAY, _text
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name='ml_features' AND column_name='tokens';
```

### 2. Verify Row Counts
```sql
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE tokens IS NULL) AS nulls,
    COUNT(*) FILTER (WHERE tokens = '{}') AS empty
FROM ml_features;
```

### 3. Sample Data Inspection
```sql
SELECT txn_id, tokens, array_length(tokens, 1)
FROM ml_features
WHERE tokens IS NOT NULL
LIMIT 5;
```

**Checkpoint**: Note total row count and sample tokens format.

---

## Migration Execution

### 1. Backup First (Critical)
```bash
# Full backup
pg_dump $DATABASE_URL > ml_features_backup_$(date +%Y%m%d_%H%M%S).sql

# Or table-only backup
pg_dump $DATABASE_URL -t ml_features > ml_features_table_backup.sql
```

### 2. Apply Migration
```bash
cd apps/backend
source .venv/Scripts/activate  # Windows: .venv/Scripts/activate

# Check pending migrations
alembic current
alembic history | grep 502d44cd70ab

# Apply migration (dry-run first if possible)
alembic upgrade 502d44cd70ab

# Expected output:
# INFO  [alembic.runtime.migration] Running upgrade 20251109_add_user_name_picture -> 502d44cd70ab, convert_ml_features_tokens_to_jsonb
```

**Duration estimate**: ~5-30 seconds for small tables (<10K rows), longer for larger tables.

**Blocking**: Column type conversion locks the table briefly. GIN index creation is non-blocking.

### 3. Monitor for Errors
```bash
# Watch Postgres logs during migration
tail -f /var/log/postgresql/postgresql-*.log

# Check for lock waits
SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock';
```

---

## Post-Migration Validation

### 1. Verify Column Type Changed
```sql
-- Should show: jsonb, jsonb
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name='ml_features' AND column_name='tokens';
```

**✓ Pass**: `data_type = 'jsonb'`

### 2. Validate Data Integrity
```sql
-- Should return 0 (all non-null values must be JSON arrays)
SELECT COUNT(*) AS invalid_types
FROM ml_features
WHERE tokens IS NOT NULL AND jsonb_typeof(tokens) <> 'array';
```

**✓ Pass**: `invalid_types = 0`

### 3. Verify GIN Index Created
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename='ml_features' AND indexname='ix_ml_features_tokens_gin';
```

**✓ Pass**: Index exists with `USING gin (tokens jsonb_ops)`

### 4. Test Index Performance
```sql
EXPLAIN (ANALYZE)
SELECT txn_id FROM ml_features WHERE tokens @> '["test"]'::jsonb;
```

**✓ Pass**: Query plan shows "Index Scan using ix_ml_features_tokens_gin"

### 5. Sample Data Roundtrip
```sql
-- Compare before (from backup notes) with after
SELECT txn_id, tokens, jsonb_array_length(tokens) AS len
FROM ml_features
WHERE tokens IS NOT NULL
LIMIT 5;
```

**✓ Pass**: Token arrays preserved (format changed: `{a,b}` → `["a","b"]`)

---

## Application Deployment

### 1. Deploy Backend (Updated Model)
```bash
cd /path/to/ops
docker-compose -f docker-compose.prod.yml build backend
docker-compose -f docker-compose.prod.yml up -d backend
```

**Wait time**: ~30 seconds for container restart

### 2. Smoke Test (Stub Mode)
```bash
curl -sS -H 'content-type: application/json' \
     -H 'x-test-mode: stub' \
     -d '{"messages":[{"role":"user","content":"test"}]}' \
     https://app.ledger-mind.org/agent/chat | jq '.content'
```

**✓ Pass**: Returns reply without errors

### 3. Health Check
```bash
curl -sS https://app.ledger-mind.org/ready | jq '.'
```

**✓ Pass**: `ok=true, llm_ok=true, db_ok=true`

### 4. LLM Health (Optional)
```bash
./scripts/llm-health.sh
# or
./scripts/llm-health.ps1
```

**✓ Pass**: Exit code 0, "LLM: healthy"

---

## Rollback Plan (If Needed)

### When to Rollback
- Data integrity check fails (invalid_types > 0)
- Application errors referencing `tokens` column
- Performance degradation detected

### Rollback Steps

1. **Downgrade Migration**:
   ```bash
   cd apps/backend
   alembic downgrade -1

   # Expected output:
   # INFO  [alembic.runtime.migration] Running downgrade 502d44cd70ab -> 20251109_add_user_name_picture
   ```

2. **Verify Rollback**:
   ```sql
   -- Should show: ARRAY, _text
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name='ml_features' AND column_name='tokens';

   -- Index should be gone
   SELECT COUNT(*) FROM pg_indexes
   WHERE tablename='ml_features' AND indexname='ix_ml_features_tokens_gin';
   ```

3. **Redeploy Previous Backend** (if app was updated):
   ```bash
   git checkout <previous-commit>
   docker-compose -f docker-compose.prod.yml build backend
   docker-compose -f docker-compose.prod.yml up -d backend
   ```

4. **Restore from Backup** (worst case):
   ```bash
   psql $DATABASE_URL < ml_features_backup_YYYYMMDD_HHMMSS.sql
   ```

---

## Performance Notes

### Query Patterns

**Before (text[]):**
```sql
-- Containment (slower without GIN on text[])
SELECT * FROM ml_features WHERE 'word' = ANY(tokens);
```

**After (jsonb):**
```sql
-- Element existence (GIN-indexed)
SELECT * FROM ml_features WHERE tokens ? 'word';

-- Array containment (GIN-indexed)
SELECT * FROM ml_features WHERE tokens @> '["word1","word2"]'::jsonb;

-- Array length
SELECT * FROM ml_features WHERE jsonb_array_length(tokens) > 5;
```

### Index Comparison

- **jsonb_ops** (default): Supports all JSONB operators, larger index
- **jsonb_path_ops**: Smaller index, only `@>` and `?` operators

Current migration uses `jsonb_ops` for maximum flexibility.

---

## Sign-Off

- [ ] Pre-flight checks completed (schema, row counts, samples)
- [ ] Backup created and verified
- [ ] Migration applied successfully
- [ ] Post-migration validation passed (type, integrity, index)
- [ ] Backend deployed with JSON model
- [ ] Smoke tests passed (stub mode, health, LLM)
- [ ] No performance degradation observed
- [ ] Rollback plan tested (optional but recommended in staging)

**Deployed by**: _______________
**Date**: _______________
**Migration duration**: _______________
**Row count**: _______________
**Notes**: _______________
