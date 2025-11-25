# Phase 4: Dead Code Inventory

**Status**: In Progress
**Branch**: `chore/repo-cleanup-phase4-deadcode`

---

## Backend Dead Code Candidates

### ✅ Confirmed Dead - Safe to Remove

**One-off migration scripts (already run)**:
- `apps/backend/drop_legacy_tables.py` — Manual script to drop legacy rule_suggestions tables (already executed)
- `apps/backend/drop_legacy_prod.py` — Production version of above (already executed)
- `apps/backend/verify_deployment.py` — One-time deployment verification script
- `apps/backend/backfill_user_id.py` — One-time backfill script for user_id column
- `apps/backend/add_unique_index.py` — One-time index addition script
- `apps/backend/check_not_null.py` — One-time schema validation script

**Debug/scratch scripts (development only)**:
- `apps/backend/debug_canonical.py` — Debug script for testing canonical URLs
- `apps/backend/debug_tables.py` — Debug script for inspecting database tables
- `apps/backend/query_suggestions.py` — Debug script for querying suggestions
- `apps/backend/ping_suggest.py` — Debug script for testing suggest endpoint
- `apps/backend/check_users.py` — Debug script for user inspection
- `apps/backend/check_hints.py` — Debug script for hint validation
- `apps/backend/check_test_hints.py` — Debug script for test hints
- `apps/backend/test_cvs_hint.py` — Debug script for CVS hint testing
- `apps/backend/test_hint_matching.py` — Debug script for hint matching
- `apps/backend/test_demo_manual.py` — Manual demo test script
- `apps/backend/test_demo_simple.py` — Simple demo test script
- `apps/backend/test_streaming_smoke.py` — Streaming smoke test (duplicate of proper tests)
- `apps/backend/validate_hermetic.py` — Hermetic test validation (moved to scripts/)
- `apps/backend/verify_demo_seed.py` — Demo seed verification (development only)
- `apps/backend/demo_improvements.py` — Demo improvements script (development only)
- `apps/backend/ingest_rag.py` — RAG ingestion script (should be in scripts/)
- `apps/backend/ingest_sample_docs.py` — Sample docs ingestion (should be in scripts/)
- `apps/backend/ingest_v2.py` — V2 ingestion script (should be in scripts/)

**Broken test file**:
- `apps/backend/tests/unit/test_prom_expo_helper.py` — Import error: `from ..helpers.prom_expo` (helpers module doesn't exist in tests/)

**Total candidates**: 25 files

### 🔍 Need Verification

**Legacy stubs** (marked for removal in code comments):
- `apps/backend/app/services/rule_suggestions.py` — Entire file is stub functions for removed system
- `apps/backend/app/routers/rules.py` — Contains `_LegacyRuleSuggestionsCompat` class and stubs (lines 36-112)

**CSV data files** (training/development):
- `apps/backend/sample_hints.csv` — Old hints (superseded by pass3?)
- `apps/backend/sample_hints_pass2.csv` — Old hints (superseded by pass3?)
- `apps/backend/sample_hints_pass3_real_data.csv` — Current hints? (keep if used)
- `apps/backend/extended_training_data.csv` — Extended training data (verify if used)

**Legacy endpoint candidates** (from grep search):
- `/gpt/chat` redirect endpoint → `/agent/chat` (line 2248 in `agent.py`)
- Legacy in-memory stores in `main.py` (line 592) — marked "safe to remove if unused"
- Legacy OAuth router comment (line 896 in `main.py`) — just a comment, ignore

---

## Frontend Dead Code Candidates

### 🔍 To Search

**Components**:
- Search for components not imported anywhere
- Check for old ChatDock variations
- Look for unused panels/drawers

**Hooks/Utils**:
- Find hooks/utils with zero imports
- Check for deprecated helpers

**Routes/Pages**:
- Verify all routes in router are still used
- Check for old page components

---

## Action Plan

**Phase 4.1 - Backend Cleanup**:
1. ✅ Remove one-off migration scripts (14 files)
2. ✅ Remove debug/scratch scripts (11 files)
3. ✅ Fix or remove broken test file (1 file)
4. ⏳ Remove `app/services/rule_suggestions.py` stub file
5. ⏳ Clean up legacy stubs in `app/routers/rules.py`
6. ⏳ Verify and consolidate CSV data files
7. ⏳ Remove legacy endpoint stubs if truly unused

**Phase 4.2 - Frontend Cleanup**:
1. ⏳ Search for unused components
2. ⏳ Search for unused hooks/utils
3. ⏳ Verify all routes

**Phase 4.3 - Test Cleanup**:
1. ⏳ Remove tests for deleted code
2. ⏳ Update assertions for current behavior

**Phase 4.4 - Structural Polish**:
1. ⏳ Move remaining scripts to `scripts/`
2. ⏳ Ensure root is clean
3. ⏳ Fix doc cross-links
4. ⏳ Run final test suite

---

## Notes

- All one-off migrations have been executed (verified by checking git history and database state)
- Debug scripts are development-only and not used in production or CI
- Broken test file has import error that blocks all pytest runs - must fix or remove
- Legacy stubs are marked with comments indicating they can be removed
- CSV files need verification against current training pipeline
