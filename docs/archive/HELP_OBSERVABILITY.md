# Help System Observability Guide

## Overview

This document describes the observability features added to the RAG-enhanced help system to make it easier to monitor cache performance, validate functionality, and debug issues in development and production.

---

## 1. Cache Metrics

### Gauge: `lm_help_cache_keys`

**Purpose**: Track the number of `help:*` keys currently stored in the cache (Redis or in-memory).

**Labels**: None (single gauge value)

**Updates**:
- After every `cache_set()` call
- After every `cache_clear()` call

**Query Examples**:
```promql
# Current number of cached help entries
lm_help_cache_keys

# Rate of cache key changes over 5m
rate(lm_help_cache_keys[5m])
```

**Implementation**: See `apps/backend/app/utils/cache.py` → `_update_cache_gauge()`

---

## 2. Cache Hit Ratio Alert

### Alert: `HelpCacheLowHitRatio`

**File**: `prometheus/rules/help_cache.yml`

**Trigger**: Cache hit ratio < 20% for 15 minutes

**Severity**: Warning

**PromQL**:
```promql
(
  sum(rate(lm_help_requests_total{cache="hit"}[5m]))
  /
  sum(rate(lm_help_requests_total[5m]))
) < 0.20
```

**Interpretation**:
- **< 20%**: Indicates potential issues (cache TTL too short, frequent clears, Redis issues)
- **60-80%**: Normal/healthy range (panels + months vary, cache warms up over time)
- **> 90%**: Excellent (but may indicate stale data if too static)

**Actions on Alert**:
1. Check Redis connectivity: `docker compose logs redis`
2. Review cache TTL setting: `HELP_CACHE_TTL_SEC` (default: 600s)
3. Check if cache is being cleared frequently: `make help-cache-bust` usage
4. Verify new panels/months aren't being queried excessively

---

## 3. Selftest Endpoint

### `GET /agent/describe/_selftest?month=YYYY-MM`

**Purpose**: Fast validation endpoint for CI/CD and pre-commit hooks.

**Parameters**:
- `month` (query param): Month to test (default: `2025-11`)
  - Must be in `YYYY-MM` format
  - Month must be 1-12 (returns 422 if invalid)

**Response**:
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
  "all_ok": true,
  "errors": {}  // Only present if any panel failed
}
```

**Success Criteria**:
- Panel returns non-empty `why` field
- No exceptions during explainer execution

**Makefile Helper**:
```bash
make help-selftest
```
Output:
```
✅ All panels OK
```
Or:
```
❌ Failures: charts.month_merchants, charts.daily_flows
```

**Use Cases**:
1. **Pre-commit validation**: Ensure prompt changes don't break explainers
2. **CI health checks**: Validate backend is healthy before deployment
3. **Smoke testing**: Quick validation after rebuild/restart

---

## 4. Cache Clear Endpoint

### `POST /agent/describe/_cache/clear?prefix=help:`

**Purpose**: Manually clear cached help entries (dev/admin tool).

**Parameters**:
- `prefix` (query param): Cache key prefix to clear (default: `help:`)
  - `help:` → Clear all help entries
  - `help:charts.month_merchants` → Clear only merchant panel entries
  - `help:charts.month_merchants:2025-11` → Clear single month/panel entry

**Response**:
```json
{
  "prefix": "help:",
  "message": "Cache entries matching 'help:*' cleared successfully"
}
```

**Makefile Helper**:
```bash
make help-cache-bust
```
Output:
```
Clearing help cache...
Cache entries matching 'help:*' cleared successfully
```

**Use Cases**:
1. **Prompt tuning**: Clear cache to test new prompts immediately
2. **Bug fixes**: Force fresh explanations after fixing explainer logic
3. **Data refresh**: Clear cache after uploading new transactions

**Metrics Side Effect**: Updates `lm_help_cache_keys` gauge after clearing

---

## 5. Month Validation Helper

### `_validate_month_or_422(month: str)`

**Purpose**: Centralized month validation to ensure consistent error handling.

**Validation**:
1. Month must match regex: `^\d{4}-\d{2}$`
2. Month number must be in range 1-12

**Error Response** (422):
```json
{
  "detail": "Month must be between 1 and 12, got 13"
}
```

**Usage**:
- Called by `GET /agent/describe/{panel_id}` before routing to explainer
- Called by `GET /agent/describe/_selftest` before testing panels
- Used in all endpoints that accept `month` parameter

**Example**:
```bash
curl http://localhost:8080/agent/describe/charts.month_merchants?month=2025-13
# Returns: HTTP 422 {"detail": "Month must be between 1 and 12, got 13"}
```

---

## 6. Frontend UX Badges

### CardHelpTooltip Badges

**Location**: `apps/web/src/components/CardHelpTooltip.tsx`

**Badge Types**:

#### 1. HEURISTIC Badge (Amber)
- **Condition**: `reasons` includes `"heuristic"`
- **Color**: Amber (`bg-amber-100`, `text-amber-700`)
- **Meaning**: Explanation generated from rule-based heuristics (no LLM)
- **Visibility**: Shows on "Why" tab when heuristics were used

#### 2. AI-GROUNDED Badge (Sky Blue)
- **Condition**: `grounded === true`
- **Color**: Sky blue (`bg-sky-100`, `text-sky-700`)
- **Meaning**: Explanation generated using RAG search + LLM
- **Visibility**: Shows on "Why" tab when RAG/LLM was successfully used

#### 3. DETERMINISTIC Badge (Gray)
- **Condition**: Always shows on "What" tab
- **Color**: Gray/muted (`opacity-60`)
- **Meaning**: Static card description (no dynamic generation)
- **Visibility**: Shows on "What" tab only

**Visual Example**:
```
┌─ Why Tab ──────────────────────────────────┐
│ [HEURISTIC] [AI-GROUNDED]                  │
│                                             │
│ Utilities present - recurring monthly      │
│ bills • E-commerce/retail - check for...   │
└─────────────────────────────────────────────┘
```

**Backend Response** (required fields):
```json
{
  "explain": "Combined what + why explanation",
  "sources": [],
  "reasons": ["heuristic"],  // or ["rag"]
  "grounded": false  // or true
}
```

---

## 7. Makefile Helpers Summary

### Existing Targets (from validator setup):

```bash
make help-why          # Strict validation (fails on empty)
make help-why-soft     # Soft mode (warns only)
make help-why-skip     # Skip validation
```

### New Observability Targets:

```bash
make help-selftest     # Fast CI-ready validation
make help-cache-bust   # Clear help cache
```

**Full Example Workflow**:
```bash
# 1. Clear cache to force fresh explanations
make help-cache-bust

# 2. Test all panels quickly
make help-selftest

# 3. Run full validation suite
make help-why

# 4. Check metrics
curl http://localhost:8080/metrics | grep lm_help
```

---

## 8. Metrics Cheat Sheet

### Cache Performance Metrics

```promql
# Cache hit ratio (target: > 60%)
sum(rate(lm_help_requests_total{cache="hit"}[5m]))
/
sum(rate(lm_help_requests_total[5m]))

# Cache key count (current size)
lm_help_cache_keys

# Cache miss rate (lower is better)
rate(lm_help_requests_total{cache="miss"}[5m])

# Cache refresh rate (manual cache busts)
rate(lm_help_requests_total{cache="refresh"}[5m])
```

### RAG Performance Metrics

```promql
# RAG success rate (target: > 50%)
sum(rate(lm_help_rag_total{status="hit"}[5m]))
/
sum(rate(lm_help_rag_total[5m]))

# RAG latency percentiles
histogram_quantile(0.95, rate(lm_help_rag_latency_seconds_bucket[5m]))

# Fallback rate (heuristic usage)
rate(lm_help_rag_total{status="heuristic"}[5m])
```

### Panel Request Distribution

```promql
# Requests per panel (top 5)
topk(5, sum by (panel_id) (rate(lm_help_requests_total[5m])))

# Most cached panel
topk(1, sum by (panel_id) (rate(lm_help_requests_total{cache="hit"}[5m])))
```

---

## 9. Troubleshooting Guide

### Symptom: Cache hit ratio < 20%

**Check**:
1. Redis connectivity: `docker compose logs redis`
2. Cache TTL too short: `grep HELP_CACHE_TTL_SEC .env` (should be ≥ 600)
3. Frequent cache clears: Check `make help-cache-bust` usage logs
4. New months being queried: Review month distribution in metrics

**Fix**:
- Increase TTL: `HELP_CACHE_TTL_SEC=1200` (20 minutes)
- Reduce cache clears: Only use `help-cache-bust` during development
- Pre-warm cache: Run `help-selftest` after deployment

---

### Symptom: Selftest failing for specific panel

**Check**:
```bash
make help-selftest
# Output: ❌ Failures: charts.month_merchants
```

**Debug**:
```bash
# 1. Get detailed response
curl http://localhost:8080/agent/describe/_selftest?month=2025-11 | jq

# 2. Check specific panel directly
curl http://localhost:8080/agent/describe/charts.month_merchants?month=2025-11

# 3. Review backend logs
docker compose logs backend | grep ERROR
```

**Common Causes**:
- Database empty (no transactions for test month)
- Month validation error (invalid format)
- Explainer function exception

---

### Symptom: Badges not showing in frontend

**Check**:
1. Response includes `reasons` and `grounded` fields:
   ```bash
   curl -X POST http://localhost:8080/agent/describe/charts.month_merchants \
     -H "Content-Type: application/json" \
     -d '{"card_id": "charts.month_merchants", "month": "2025-11"}' | jq
   ```

2. Frontend fetches explanation successfully:
   - Open browser DevTools → Network tab
   - Trigger "Why" tab in CardHelpTooltip
   - Inspect response body

**Fix**:
- Backend: Ensure all explainers set `reasons` and `grounded` in return dict
- Frontend: Check CardHelpTooltip state updates (`setReasons`, `setGrounded`)

---

## 10. Best Practices

### Development

1. **Clear cache after prompt changes**:
   ```bash
   make help-cache-bust
   ```

2. **Validate before commit**:
   ```bash
   make help-why
   ```

3. **Test selftest endpoint**:
   ```bash
   make help-selftest
   ```

### Production

1. **Monitor cache hit ratio**: Set up alert for < 20% sustained
2. **Track RAG success rate**: Ensure > 50% of requests use RAG successfully
3. **Review panel distribution**: Identify most/least used panels
4. **Check latency**: Monitor P95 latency for slow panels

### CI/CD

1. **Pre-deployment health check**:
   ```yaml
   - name: Validate help panels
     run: make help-selftest
   ```

2. **Post-deployment smoke test**:
   ```yaml
   - name: Verify help endpoints
     run: |
       curl https://app.ledger-mind.org/agent/describe/_selftest?month=2025-11
   ```

---

## 11. Related Documentation

- **RAG Implementation**: `RAG_HELP_IMPLEMENTATION.md`
- **Validator Setup**: `HELP_VALIDATOR_SETUP.md`
- **Test Fix Summary**: `TEST_FIX_SUMMARY.md`
- **API Documentation**: `GET /agent/describe/{panel_id}`
- **Prometheus Rules**: `prometheus/rules/help_cache.yml`

---

## 12. Quick Reference

| Feature | Endpoint/Command | Purpose |
|---------|------------------|---------|
| Selftest | `GET /agent/describe/_selftest` | Fast panel validation |
| Cache Clear | `POST /agent/describe/_cache/clear` | Manual cache invalidation |
| Cache Gauge | `lm_help_cache_keys` metric | Monitor cache size |
| Hit Ratio Alert | `HelpCacheLowHitRatio` | Alert on low cache performance |
| UX Badges | CardHelpTooltip component | Show explanation source to users |
| Validation | `make help-why` | Strict validation (fails on empty) |
| Fast Test | `make help-selftest` | Quick CI-ready check |
| Cache Bust | `make help-cache-bust` | Clear all help cache |

---

## Version History

- **v1.0** (2025-01-XX): Initial observability features
  - Cache keys gauge
  - Hit ratio alert
  - Selftest endpoint
  - Cache clear endpoint
  - Month validation helper
  - Frontend UX badges
  - Makefile helpers
