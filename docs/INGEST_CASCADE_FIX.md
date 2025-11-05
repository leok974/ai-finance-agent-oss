# Ingest Replace Foreign Key Fix

## Problem
The `/ingest?replace=true` endpoint was returning HTTP 500 errors with the following constraint violation:

```
sqlalchemy.exc.IntegrityError: (psycopg.errors.ForeignKeyViolation) 
update or delete on table "suggestion_events" violates foreign key constraint 
"suggestion_feedback_event_id_fkey" on table "suggestion_feedback"
```

## Root Cause
When `replace=true`, the endpoint deletes all transactions. The cascade chain was:
1. `DELETE FROM transactions` 
2. → Cascades to `suggestion_events` (via `ON DELETE CASCADE`)
3. → Blocked by `suggestion_feedback` referencing events (no cascade action)

## Solution
Database migration `20251104_fk_feedback_event_cascade` adds `ON DELETE SET NULL` to the foreign key constraint:

```sql
ALTER TABLE suggestion_feedback
  DROP CONSTRAINT IF EXISTS suggestion_feedback_event_id_fkey;

ALTER TABLE suggestion_feedback
  ADD CONSTRAINT suggestion_feedback_event_id_fkey
  FOREIGN KEY (event_id)
  REFERENCES suggestion_events(id)
  ON DELETE SET NULL;
```

### Strategy: ON DELETE SET NULL
- **Preserves feedback history** for analytics and post-mortems
- **Breaks the constraint cycle** preventing deletion errors
- **Allows orphaned feedback** (event_id=NULL) to accumulate

## Changes

### 1. Database Migration
**File**: `apps/backend/alembic/versions/20251104_fk_feedback_event_cascade.py`

Adds proper cascade behavior to the FK constraint.

### 2. Simplified Ingest Logic
**File**: `apps/backend/app/routers/ingest.py`

Removed app-level delete ordering. Now simply:
```python
db.query(Transaction).delete()
db.commit()
```

The database handles cascading automatically.

### 3. Observability
**File**: `apps/backend/app/metrics.py`

Added counter for monitoring:
```python
ingest_errors = Counter(
    "lm_ingest_errors_total",
    "Ingest endpoint errors by phase",
    labelnames=("phase",),
)
```

Use in Grafana:
```promql
rate(lm_ingest_errors_total{phase="replace"}[5m]) > 0
```

### 4. Tests
**File**: `apps/backend/tests/test_ingest_cascade.py`

Validates:
- Events cascade delete correctly
- Feedback event_id becomes NULL (not deleted)
- Multiple replace cycles work without FK violations

## Deployment

```bash
# Apply migration
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c /app/alembic.ini upgrade head

# Verify FK constraint
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U myuser -d finance -c \
  "SELECT pg_get_constraintdef(oid) FROM pg_constraint 
   WHERE conname = 'suggestion_feedback_event_id_fkey'"

# Expected output:
# FOREIGN KEY (event_id) REFERENCES suggestion_events(id) ON DELETE SET NULL
```

## Testing

```bash
# Unit tests
docker compose -f docker-compose.prod.yml exec backend \
  python -m pytest tests/test_ingest_cascade.py -v

# API smoke test
curl -X POST -F "file=@sample.csv" "http://localhost/ingest?replace=true"
# Should return: {"ok":true,"added":N,...}

# Test multiple replaces (should not fail)
for i in {1..3}; do
  curl -X POST -F "file=@sample.csv" "http://localhost/ingest?replace=true"
done
```

## Maintenance

### Orphaned Feedback Cleanup

Feedback with `event_id=NULL` will accumulate over time. A cleanup script is provided:

```bash
# Dry run (see what would be deleted)
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/cleanup_orphaned_feedback.py --days 90 --dry-run

# Actual cleanup (delete orphaned feedback older than 90 days)
docker compose -f docker-compose.prod.yml exec backend \
  python scripts/cleanup_orphaned_feedback.py --days 90
```

#### Automated Cleanup (Optional)

Add weekly cron job (Sunday 2 AM UTC):
```bash
0 2 * * 0 cd /path/to/project && \
  docker compose -f docker-compose.prod.yml exec -T backend \
  python scripts/cleanup_orphaned_feedback.py --days 90
```

Or add as docker-compose service (see `scripts/cleanup_orphaned_feedback.cron` for example).

## Monitoring

### Grafana Dashboard

Import the pre-built dashboard:
- **File**: `ops/grafana/dashboards/ingest-health.json`
- **Panels**:
  - Ingest error rate (5m window)
  - Total errors (24h)
  - Recent activity table
  - Active alerts
  - Backend logs (filtered for ingest)

### Prometheus Alerts

Configured in `prometheus/rules/ingest.yml`:

1. **IngestReplaceErrors** (severity: page)
   - Triggers: Any replace errors in 5m window
   - Duration: 2 minutes
   - Action: Immediate investigation required

2. **IngestReplaceErrorsHigh** (severity: critical)
   - Triggers: Error rate > 0.1 req/s
   - Duration: 1 minute
   - Action: System degraded, check database health

3. **OrphanedFeedbackAccumulating** (severity: info)
   - Triggers: >30% of feedback is orphaned
   - Duration: 24 hours
   - Action: Run cleanup script

## Metrics

Monitor ingest health with:

```promql
# Replace errors (should be 0)
rate(lm_ingest_errors_total{phase="replace"}[5m])

# Total errors in last 24h
increase(lm_ingest_errors_total{phase="replace"}[24h])

# Alert if any errors occur
rate(lm_ingest_errors_total{phase="replace"}[5m]) > 0
```

**Grafana Dashboard**: Import `ops/grafana/dashboards/ingest-health.json` for comprehensive monitoring.

## Rollback

If issues arise, downgrade the migration:

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python -m alembic -c /app/alembic.ini downgrade -1
```

**WARNING**: This will restore the FK bug causing 500 errors on replace=true.

## Related Issues
- Original issue: nginx 500 errors on `/ingest?replace=true`
- Fixed in: PR #XXX
- Migration: `20251104_fk_feedback_event_cascade`
