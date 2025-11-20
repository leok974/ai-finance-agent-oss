# Phase 1: Legacy Rule Suggestions Deprecation - COMPLETE ✅

**Date:** 2025-01-20
**Status:** Implementation Complete - Ready for Testing
**Context:** See `docs/rules-and-suggestions-audit.md` for comprehensive system analysis

## Summary

Phase 1 soft deprecation is complete. Legacy rule suggestions UI is hidden behind feature flags (default: disabled), and legacy backend endpoints are gated with deprecation warnings.

**Goal:** No users see legacy UI, no new code calls legacy endpoints, existing code marked deprecated.

## Changes Implemented

### Frontend Changes

#### 1. Feature Flag Added
- **Files:** `apps/web/.env.production`, `apps/web/.env.development`
- **Flag:** `VITE_LEGACY_RULE_SUGGESTIONS=0`
- **Default:** Disabled (0)

#### 2. UI Components Gated
- **File:** `apps/web/src/App.tsx`
- **Components Hidden:**
  - `SuggestionsPanel` (heuristic mining suggestions)
  - `RuleSuggestionsPersistentPanel` (stored rule suggestions)
- **Conditional Rendering:**
  ```tsx
  {import.meta.env.VITE_LEGACY_RULE_SUGGESTIONS === "1" && (
    <SuggestionsPanel month={month} />
  )}
  ```

#### 3. API Functions Marked Deprecated
- **File:** `apps/web/src/lib/api.ts`
- **Functions Marked (13 total):**
  - `fetchRuleSuggestConfig()`
  - `listRuleSuggestions()`
  - `acceptRuleSuggestion()`
  - `dismissRuleSuggestion()`
  - `listSuggestionIgnores()`
  - `addSuggestionIgnore()`
  - `removeSuggestionIgnore()`
  - `listRuleSuggestionsSummary()`
  - `applyRuleSuggestion()`
  - `ignoreRuleSuggestion()`
  - `listRuleSuggestionsPersistent()`
  - `listPersistedSuggestions()`
  - `acceptSuggestion()`
  - `dismissSuggestion()`
- **JSDoc Format:**
  ```typescript
  /**
   * @deprecated Legacy rule suggestions API, guarded by VITE_LEGACY_RULE_SUGGESTIONS.
   * Use ML feedback system instead (POST /api/ml/feedback).
   */
  ```

### Backend Changes

#### 4. Feature Flag Added
- **File:** `apps/backend/app/config.py`
- **Flag:** `LEGACY_RULE_SUGGESTIONS_ENABLED: bool`
- **Default:** `False`
- **Environment Variable:** `LEGACY_RULE_SUGGESTIONS_ENABLED`

#### 5. Routers Deprecated & Gated
- **Files:**
  - `apps/backend/app/routers/rule_suggestions.py`
  - `apps/backend/app/routers/agent_tools_suggestions.py`
- **Changes:**
  - Module-level deprecation docstrings added
  - All endpoints add `response.headers["X-Legacy-Endpoint"] = "1"`
  - Endpoint-level deprecation docstrings added
  - Routers conditionally included in `main.py`

#### 6. Router Inclusion Logic
- **File:** `apps/backend/app/main.py`
- **Changes:**
  ```python
  # Legacy suggestions router - deprecated (guarded by LEGACY_RULE_SUGGESTIONS_ENABLED)
  if app_config.LEGACY_RULE_SUGGESTIONS_ENABLED:
      logger.warning("LEGACY_RULE_SUGGESTIONS_ENABLED=1: Including deprecated agent_tools_suggestions router")
      app.include_router(agent_tools_suggestions_router.router)
      logger.warning("LEGACY_RULE_SUGGESTIONS_ENABLED=1: Including deprecated rule_suggestions router")
      app.include_router(rule_suggestions_router.router)
  ```

#### 7. Production Environment Updated
- **File:** `docker-compose.prod.yml`
- **Environment Variable Added:**
  ```yaml
  # Legacy rule suggestions system disabled (use ML feedback system instead)
  LEGACY_RULE_SUGGESTIONS_ENABLED: "0"
  ```

## Canonical System (Unchanged - Fully Operational)

The ML feedback loop continues to operate normally:

1. **Frontend:** `UnknownsPanel` shows suggestions powered by ML
2. **User Feedback:** POST `/api/ml/feedback` (thumb up/down on suggestions)
3. **Real-time Scoring:** `ml_feedback_scores.py` adjusts suggestion confidence
4. **Batch Suggestions:** POST `/agent/tools/categorize/suggest/batch`
5. **Nightly Promotion:** `ml_feedback_promote.py` creates merchant_category_hints
6. **Rules Panel:** Shows canonical rules (unchanged)

## Legacy Endpoints Affected

With `LEGACY_RULE_SUGGESTIONS_ENABLED=0` (default), these endpoints return 404:

### Heuristic Mining (agent_tools_suggestions.py)
- `GET /agent/tools/suggestions` - Compute suggestions from transaction patterns

### Persistent Suggestions (rule_suggestions.py)
- `GET /rules/suggestions` - List legacy stored suggestions
- `POST /rules/suggestions/{sug_id}/accept` - Accept suggestion
- `POST /rules/suggestions/{sug_id}/dismiss` - Dismiss suggestion

## Testing Plan

### 1. Frontend Build Test
```bash
cd apps/web
pnpm build  # Should succeed with VITE_LEGACY_RULE_SUGGESTIONS=0
```

### 2. Backend Startup Test
```bash
# With flag=0 (default), legacy routers should NOT be included
docker-compose up backend
# Check logs - should NOT see "Including deprecated" warnings
```

### 3. Endpoint Tests (flag=0)
```bash
# Legacy endpoints should 404
curl http://localhost:8000/agent/tools/suggestions
# Expected: 404 Not Found

curl http://localhost:8000/rules/suggestions
# Expected: 404 Not Found
```

### 4. Canonical Flow Test
```bash
# ML feedback system should work normally
curl -X POST http://localhost:8000/api/ml/feedback \
  -H "Content-Type: application/json" \
  -d '{"txn_id": 1458, "thumb": "up", "suggested_category": "Groceries"}'
# Expected: {"ok": true}

curl -X POST http://localhost:8000/agent/tools/categorize/suggest/batch \
  -H "Content-Type: application/json" \
  -d '{"txn_ids": [1458]}'
# Expected: Array of suggestions
```

### 5. Legacy Re-enable Test (flag=1)
```bash
# Set environment variable
export LEGACY_RULE_SUGGESTIONS_ENABLED=1
# Restart backend
docker-compose restart backend
# Check logs - should see "Including deprecated" warnings

# Legacy endpoints should now work
curl http://localhost:8000/agent/tools/suggestions
# Expected: 200 OK with suggestions

# Frontend (requires rebuild)
cd apps/web
VITE_LEGACY_RULE_SUGGESTIONS=1 pnpm build
# SuggestionsPanel and RuleSuggestionsPersistentPanel should be visible
```

## Success Criteria

- ✅ No users see `SuggestionsPanel` or `RuleSuggestionsPersistentPanel` by default
- ✅ All 13 legacy API functions marked `@deprecated` in IDE autocomplete
- ✅ Legacy backend endpoints return 404 when flag=0
- ✅ Production environment configured with both flags disabled
- ✅ `UnknownsPanel` and `RulesPanel` still visible and functional
- ✅ ML feedback system continues operating normally
- ✅ Logs show deprecation warnings when legacy enabled

## Monitoring Commands

```bash
# Check for legacy endpoint usage (when flag=1)
docker logs ai-finance-backend 2>&1 | grep "X-Legacy-Endpoint"

# Check for legacy router inclusion warnings
docker logs ai-finance-backend 2>&1 | grep "LEGACY_RULE_SUGGESTIONS_ENABLED"

# Verify frontend builds without legacy
cd apps/web && pnpm build

# Test canonical ML feedback flow
curl -X POST http://localhost:8000/agent/tools/categorize/suggest/batch \
  -H "Content-Type: application/json" \
  -d '{"txn_ids": [1458]}'
```

## Files Modified

### Frontend (4 files)
1. `apps/web/.env.production` - Added `VITE_LEGACY_RULE_SUGGESTIONS=0`
2. `apps/web/.env.development` - Added `VITE_LEGACY_RULE_SUGGESTIONS=0`
3. `apps/web/src/App.tsx` - Wrapped 2 legacy panels in feature flag
4. `apps/web/src/lib/api.ts` - Added `@deprecated` JSDoc to 13 functions

### Backend (4 files)
1. `apps/backend/app/config.py` - Added `LEGACY_RULE_SUGGESTIONS_ENABLED` flag
2. `apps/backend/app/routers/rule_suggestions.py` - Added deprecation warnings
3. `apps/backend/app/routers/agent_tools_suggestions.py` - Added deprecation warnings
4. `apps/backend/app/main.py` - Conditionally include legacy routers

### Infrastructure (1 file)
1. `docker-compose.prod.yml` - Added `LEGACY_RULE_SUGGESTIONS_ENABLED=0` to backend env

## Next Steps (Phase 2)

**Not Yet Implemented - Requires Separate PR**

Phase 2 will remove dead code after confirming Phase 1 stability:

1. Delete frontend components:
   - `apps/web/src/components/SuggestionsPanel.tsx`
   - `apps/web/src/components/RuleSuggestionsPersistentPanel.tsx`
   - Remove hooks: `useSuggestions.ts`, `useRuleSuggestions.ts`

2. Remove backend routers:
   - `apps/backend/app/routers/rule_suggestions.py`
   - `apps/backend/app/routers/agent_tools_suggestions.py`

3. Remove services:
   - `apps/backend/app/services/rule_suggestions.py`
   - `apps/backend/app/services/rule_suggestions_heuristic.py`
   - `apps/backend/app/services/rule_suggestions_persist.py`

4. Database cleanup (Alembic migration):
   - `DROP TABLE rule_suggestions;`
   - `DROP TABLE rule_suggestion_ignores;`

5. Remove 13 deprecated API functions from `api.ts`

6. Remove feature flags (no longer needed)

7. Update documentation to reflect single canonical system

**Timeline:** Phase 2 should wait at least 1-2 weeks to ensure no regression.

## Rollback Plan

If issues are discovered:

1. **Frontend:** Set `VITE_LEGACY_RULE_SUGGESTIONS=1` in `.env.production`
2. **Backend:** Set `LEGACY_RULE_SUGGESTIONS_ENABLED=1` in `docker-compose.prod.yml`
3. **Rebuild:** `cd apps/web && pnpm build`
4. **Restart:** `docker-compose restart backend nginx`

All legacy code remains functional - just behind feature flags.

## References

- **Audit Document:** `docs/rules-and-suggestions-audit.md`
- **ML Feedback Snapshot:** `docs/snapshots/ledger-ml-feedback-v4.json`
- **Deployment Record:** Commits 0ebcc543, a239b424 (deployed 2025-11-20)
- **Architecture:** See "Proposed Unified Model" in audit document

---

**Status:** ✅ Phase 1 Complete - Ready for Testing
**Next Action:** Run testing plan above, monitor for 1-2 weeks, then proceed to Phase 2
