# Help System Observability - Implementation Summary

## Changes Made

All observability improvements have been successfully implemented for the RAG-enhanced help system.

---

## 1. Backend Changes

### `apps/backend/app/metrics_ml.py`
✅ **Added**: `lm_help_cache_keys` Gauge metric
- Tracks number of `help:*` keys in cache (Redis or in-memory)
- Updated by `cache_set()` and `cache_clear()` operations

### `apps/backend/app/utils/cache.py`
✅ **Added**: Cache metrics integration
- Import `lm_help_cache_keys` gauge (gracefully handles import failure)
- `cache_set()`: Updates gauge after successful cache write
- `cache_clear(prefix)`: Now supports prefix-based clearing (e.g., `help:`)
- `_update_cache_gauge()`: Helper to update gauge for both Redis and in-memory

### `apps/backend/app/services/explain.py`
✅ **Updated**: Explain TypedDict and metadata tracking
- Added `reasons: NotRequired[List[str]]` field (tracks "rag", "llm", "heuristic")
- Added `grounded: NotRequired[bool]` field (True if RAG/LLM used)
- `explain_month_merchants()`: Now sets `reasons` and `grounded` based on RAG availability

### `apps/backend/app/routers/agent_describe.py`
✅ **Added**: New observability endpoints
- `GET /agent/describe/_selftest?month=YYYY-MM`: Fast CI-ready validation
  - Tests all 5 panels
  - Returns `{"month": str, "ok": {panel: bool}, "all_ok": bool, "errors": {...}}`
- `POST /agent/describe/_cache/clear?prefix=help:`: Manual cache clearing
  - Supports prefix-based clearing
  - Returns `{"prefix": str, "message": str}`
- `_validate_month_or_422(month)`: Centralized month validation helper
  - Ensures month is 1-12
  - Returns 422 on invalid month
  
✅ **Updated**: GET and POST endpoints
- `GET /{panel_id}`: Now uses `_validate_month_or_422()` for early validation
- `POST /{panel_id}`: Returns `reasons` and `grounded` fields in response

---

## 2. Frontend Changes

### `apps/web/src/lib/agent/explain.ts`
✅ **Updated**: ExplainResponse type
- Added `reasons?: string[]` field
- Added `grounded?: boolean` field
- `fetchCardExplain()`: Returns new fields in response

### `apps/web/src/components/CardHelpTooltip.tsx`
✅ **Added**: UX badges for explanation sources
- Added `reasons` and `grounded` state variables
- Updates state when fetching explanations
- Shows badges on "Why" tab:
  - **HEURISTIC** badge (amber) when `reasons` includes "heuristic"
  - **AI-GROUNDED** badge (sky blue) when `grounded === true`
  - **DETERMINISTIC** badge (gray) on "What" tab

---

## 3. Prometheus Changes

### `prometheus/rules/help_cache.yml`
✅ **Created**: Cache hit ratio alert rule
- Alert: `HelpCacheLowHitRatio`
- Triggers when hit ratio < 20% for 15 minutes
- Severity: warning
- Includes runbook URL and diagnostic info

---

## 4. Makefile Changes

### `Makefile`
✅ **Added**: New observability targets
- `help-selftest`: Calls `/_selftest` endpoint, parses JSON with `jq`
- `help-cache-bust`: Calls `/_cache/clear` endpoint, shows confirmation

---

## 5. Documentation

### `HELP_OBSERVABILITY.md`
✅ **Created**: Comprehensive observability guide
- Covers all 7 features
- Includes metrics queries, troubleshooting, best practices
- Quick reference table
- Examples for dev, prod, and CI/CD workflows

### `HELP_OBSERVABILITY_SUMMARY.md`
✅ **Created**: This file - implementation checklist

---

## Implementation Checklist

- [x] Add `lm_help_cache_keys` gauge metric
- [x] Update `cache.py` with metrics integration
- [x] Update `cache_clear()` to support prefix filtering
- [x] Add `_update_cache_gauge()` helper
- [x] Update `Explain` TypedDict with `reasons` and `grounded`
- [x] Update `explain_month_merchants()` to set metadata
- [x] Add `_validate_month_or_422()` helper
- [x] Add `GET /agent/describe/_selftest` endpoint
- [x] Add `POST /agent/describe/_cache/clear` endpoint
- [x] Update GET endpoint to use validation helper
- [x] Update POST endpoint to return metadata fields
- [x] Create `prometheus/rules/help_cache.yml` alert
- [x] Add Makefile targets (`help-selftest`, `help-cache-bust`)
- [x] Update frontend TypeScript types
- [x] Add UX badges to CardHelpTooltip
- [x] Create `HELP_OBSERVABILITY.md` documentation
- [x] Create `HELP_OBSERVABILITY_SUMMARY.md` checklist

---

## Testing Plan

### 1. Verify TypeScript Compilation
```bash
make web typecheck
```

### 2. Rebuild Backend
```bash
docker compose -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.prod.yml up -d backend
```

### 3. Test Selftest Endpoint
```bash
curl http://localhost:8080/agent/describe/_selftest?month=2025-11 | jq
```

Expected output:
```json
{
  "month": "2025-11",
  "ok": {
    "charts.month_merchants": true,
    "charts.month_categories": true,
    "charts.daily_flows": true,
    "charts.month_anomalies": true,
    "charts.insights_overview": true
  },
  "all_ok": true
}
```

### 4. Test Month Validation
```bash
curl http://localhost:8080/agent/describe/charts.month_merchants?month=2025-13
```

Expected: HTTP 422 with error message about month range

### 5. Test Cache Clear
```bash
curl -X POST "http://localhost:8080/agent/describe/_cache/clear?prefix=help:"
```

Expected:
```json
{
  "prefix": "help:",
  "message": "Cache entries matching 'help:*' cleared successfully"
}
```

### 6. Test Makefile Helpers
```bash
make help-selftest
# Should show: ✅ All panels OK

make help-cache-bust
# Should show: Cache entries matching 'help:*' cleared successfully
```

### 7. Verify Cache Metrics
```bash
curl http://localhost:8080/metrics | grep lm_help_cache_keys
```

Expected:
```
lm_help_cache_keys 5.0
```

### 8. Test Frontend Badges
1. Open http://localhost:8080 in browser
2. Navigate to dashboard with help tooltips
3. Click "?" button to open help tooltip
4. Switch to "Why" tab
5. Verify badges appear based on explanation source

### 9. Test Prometheus Alert
```bash
# Check alert rule is loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="help_cache")'
```

### 10. Integration Test
```bash
# 1. Clear cache
make help-cache-bust

# 2. Query panel (cache miss)
curl "http://localhost:8080/agent/describe/charts.month_merchants?month=2025-11"

# 3. Query again (cache hit)
curl "http://localhost:8080/agent/describe/charts.month_merchants?month=2025-11"

# 4. Check metrics
curl http://localhost:8080/metrics | grep -E "lm_help_(requests|cache_keys)"

# 5. Verify cache key count increased
```

---

## Rollback Plan

If issues occur, revert these files:

1. `apps/backend/app/metrics_ml.py`
2. `apps/backend/app/utils/cache.py`
3. `apps/backend/app/services/explain.py`
4. `apps/backend/app/routers/agent_describe.py`
5. `apps/web/src/lib/agent/explain.ts`
6. `apps/web/src/components/CardHelpTooltip.tsx`
7. `Makefile`

Keep:
- `prometheus/rules/help_cache.yml` (safe to keep, won't fire if metrics missing)
- `HELP_OBSERVABILITY.md` (documentation only)

---

## Next Steps

1. ✅ Complete implementation (DONE)
2. 🔄 Run typecheck (`make web typecheck`)
3. ⏳ Rebuild backend with `--no-cache`
4. ⏳ Test selftest endpoint
5. ⏳ Test cache clear endpoint
6. ⏳ Verify metrics in `/metrics`
7. ⏳ Test frontend badges
8. ⏳ Deploy to production
9. ⏳ Monitor cache hit ratio alert

---

## Success Criteria

- [ ] TypeScript compiles without errors
- [ ] Selftest endpoint returns all panels OK
- [ ] Month validation returns 422 for invalid months
- [ ] Cache clear endpoint works
- [ ] Makefile helpers work (`help-selftest`, `help-cache-bust`)
- [ ] Cache gauge metric appears in `/metrics`
- [ ] Frontend badges show correctly
- [ ] Prometheus alert rule loads
- [ ] Cache hit ratio calculable from metrics

---

## Files Created

1. `prometheus/rules/help_cache.yml` - Alert rule
2. `HELP_OBSERVABILITY.md` - Comprehensive guide
3. `HELP_OBSERVABILITY_SUMMARY.md` - This file

## Files Modified

1. `apps/backend/app/metrics_ml.py` - Added gauge
2. `apps/backend/app/utils/cache.py` - Metrics + prefix support
3. `apps/backend/app/services/explain.py` - Metadata tracking
4. `apps/backend/app/routers/agent_describe.py` - New endpoints
5. `apps/web/src/lib/agent/explain.ts` - Type updates
6. `apps/web/src/components/CardHelpTooltip.tsx` - Badges
7. `Makefile` - New targets

Total: **3 new files, 7 modified files**
