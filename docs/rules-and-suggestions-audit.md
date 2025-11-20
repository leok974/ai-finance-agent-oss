# LedgerMind Rules & Suggestions System Audit

**Date:** 2025-11-20
**Purpose:** Identify canonical vs legacy code paths for rules and suggestions across frontend (React) and backend (FastAPI)

---

## Executive Summary

LedgerMind currently has **THREE overlapping suggestion/rule systems**:

1. **NEW & CANONICAL:** ML Feedback Loop (Unknowns card → `/agent/tools/categorize/suggest/batch` → ml_feedback scoring → promotion to hints)
2. **LEGACY #1:** Rule Suggestions Panel → `/rules/suggestions` endpoints (persistent DB table, mined from feedback)
3. **LEGACY #2:** SuggestionsPanel → `/agent/tools/suggestions` (heuristic merchant/category mining, disabled by default)

**Recommendation:** Deprecate Legacy #1 and #2, unify around the new ML feedback system with merchant_category_hints as the single source of truth.

---

## 1. Frontend Surfaces

### Summary Table

| Surface | Component File | Backend APIs Used | Data Flow | Status |
|---------|---------------|-------------------|-----------|--------|
| **Unknowns Card** | `apps/web/src/components/UnknownsPanel.tsx` | • `POST /agent/tools/categorize/suggest/batch`<br>• `POST /api/txns/{id}/categorize`<br>• `POST /api/ml/feedback` (fire-and-forget) | Canonical txn-level suggestions with ML scoring | ✅ **CANONICAL** |
| **Seed Rule Button** | Inside `UnknownsPanel.tsx` (line 107) | • Emits `ruleTester:seed` event<br>• No direct API call | Prefills Rule Tester with txn context | ✅ **CANONICAL** |
| **Rule Suggestions** | `apps/web/src/components/RuleSuggestionsPersistentPanel.tsx` | • `GET /rules/suggestions/persistent` (404 fallback)<br>• `GET /rules/suggestions` (query-based)<br>• `POST /rules/suggestions/{id}/accept`<br>• `POST /rules/suggestions/{id}/dismiss`<br>• `POST /rules/suggestions/apply`<br>• `POST /rules/suggestions/ignore` | Tries persistent DB table first, falls back to mined suggestions | ⚠️ **LEGACY** |
| **Suggestions Panel** | `apps/web/src/components/SuggestionsPanel.tsx` | • `POST /agent/tools/suggestions` | Heuristic merchant/category mining from transactions | ⚠️ **LEGACY** (disabled) |
| **Rules Table** | `apps/web/src/components/RulesPanel.tsx` | • `GET /agent/tools/rules`<br>• `POST /agent/tools/rules`<br>• `DELETE /agent/tools/rules/{id}` | Manage persistent category rules | ✅ **CANONICAL** |

---

## 2. Backend APIs

### 2.1 Unknowns & ML Feedback (CANONICAL)

#### Router: `apps/backend/app/routers/agent_tools_categorize.py`

**Endpoints:**
- `POST /agent/tools/categorize/suggest` - Single transaction suggestions
- `POST /agent/tools/categorize/suggest/batch` - **Primary endpoint for Unknowns card**
- `POST /agent/tools/categorize/promote` - Promote merchant → category to rule + hint

**Service:** `apps/backend/app/services/categorize_suggest.py`
- Uses `suggest_categories_for_txn()` function
- Integrated with ML feedback scoring via `ml_feedback_scores.py` (commit 0ebcc543)
- Sources:
  1. merchant_category_hints (including ml_feedback promoted hints)
  2. CategoryRule (regex-based rules)
  3. Fallback priors (restaurants, groceries, entertainment)
- Applies real-time scoring adjustments based on ml_feedback_merchant_category_stats

**Related Tables:**
- `ml_feedback_events` - Raw user feedback events
- `ml_feedback_merchant_category_stats` - Aggregated feedback per (merchant_normalized, category)
- `merchant_category_hints` - Promoted hints with source='ml_feedback'
- `category_rules` - User-created regex rules

**Status:** ✅ **CANONICAL** - This is the primary suggestion pipeline

---

#### Router: `apps/backend/app/routers/ml_feedback.py`

**Endpoints:**
- `POST /api/ml/feedback` - Record user feedback (accept/reject on suggestions)

**Service:** `apps/backend/app/services/ml_feedback.py`
- Inserts into `ml_feedback_events`
- Updates `ml_feedback_merchant_category_stats` aggregates
- Fire-and-forget from frontend (202 ACCEPTED)

**Status:** ✅ **CANONICAL** - Core learning loop

---

#### Router: `apps/backend/app/routers/admin_ml_feedback.py`

**Endpoints:**
- `POST /admin/ml-feedback/promote-hints` - Manual promotion job with dry-run support

**Service:** `apps/backend/app/services/ml_feedback_promote.py`
- Converts strong feedback patterns → merchant_category_hints
- Quality filters: min 2 accepts, 70% accept ratio, etc.
- Confidence scoring based on accept/reject ratio + volume + recency

**Status:** ✅ **CANONICAL** - Nightly promotion service (manual runs for now)

---

### 2.2 Rule Suggestions (LEGACY)

#### Router: `apps/backend/app/routers/rule_suggestions.py`

**Endpoints:**
- `GET /rules/suggestions` - List suggestions (query params: merchant_norm, category, limit, offset)
- `POST /rules/suggestions/{id}/accept` - Accept suggestion → create rule
- `POST /rules/suggestions/{id}/dismiss` - Dismiss suggestion

**Service:** `apps/backend/app/services/rule_suggestions.py`
- Function: `list_suggestions()`, `accept_suggestion()`, `dismiss_suggestion()`
- Uses `RuleSuggestion` ORM table (separate from ml_feedback system)
- Mines from `Feedback` table (legacy feedback system, predates ml_feedback_events)
- Computes metrics from Feedback sources: {accept, user_change, accept_suggestion, rule_apply} vs {reject}

**Tables:**
- `rule_suggestions` - Persistent suggestion candidates
- `feedback` - Legacy feedback table (different from ml_feedback_events)
- `rule_suggestion_ignores` - User-dismissed suggestions

**Status:** ⚠️ **LEGACY** - Predates new ML feedback system

---

#### Router: `apps/backend/app/routers/rules.py` (partial)

**Endpoints related to suggestions:**
- `GET /rules/suggestions/config` - Returns config for suggestion mining
- `GET /rules/suggestions` - Query persistent suggestions (delegates to rule_suggestions.py)
- `POST /rules/suggestions/apply` - Apply mined suggestion as rule
- `POST /rules/suggestions/ignore` - Ignore mined suggestion
- `GET /rules/suggestions/ignores` - List ignored suggestions

**Services:**
- `app.services.rule_suggestions.mine_suggestions()` - Mines merchant/category patterns from transactions
- `app.services.rule_suggestions_store` - DB operations for RuleSuggestion table
- `app.services.rule_suggestion_ignores_store` - DB operations for ignores

**Status:** ⚠️ **LEGACY** - Separate from ML feedback pipeline

---

### 2.3 Heuristic Suggestions (LEGACY, DISABLED)

#### Router: `apps/backend/app/routers/agent_tools_suggestions.py`

**Endpoints:**
- `POST /agent/tools/suggestions` - Compute heuristic suggestions from transaction patterns

**Service:** Inline query logic in router
- Mines known (merchant, category) pairs from historical transactions
- Matches against unknown transactions for the same merchant
- Requires `SUGGESTIONS_ENABLED=1` env flag (default: disabled)
- Returns confidence based on historical frequency

**Tables:**
- `transactions` - Direct SQL aggregation

**Status:** ⚠️ **LEGACY** - Disabled by default, superseded by ML feedback system

---

### 2.4 Rules (CANONICAL)

#### Router: `apps/backend/app/routers/agent_tools_rules.py` + `rules.py`

**Endpoints:**
- `GET /agent/tools/rules` - List all rules
- `POST /agent/tools/rules` - Create new rule
- `DELETE /agent/tools/rules/{id}` - Delete rule
- `POST /agent/tools/rules/test` - Test rule against transactions
- `POST /agent/tools/rules/apply` - Apply rule to transactions

**Service:** `apps/backend/app/services/rules_service.py`

**Tables:**
- `category_rules` - User-created regex-based categorization rules

**Status:** ✅ **CANONICAL** - Primary rule management system

---

## 3. Canonical vs Legacy Classification

### ✅ CANONICAL (Keep and Invest)

**Frontend:**
- `UnknownsPanel.tsx` - ML suggestion chips with feedback loop
- `RulesPanel.tsx` - Rule management table
- Seed rule button (inside UnknownsPanel)

**Backend:**
- `/agent/tools/categorize/suggest/batch` - Main suggestion endpoint
- `/api/ml/feedback` - Feedback recording
- `/admin/ml-feedback/promote-hints` - Promotion service
- `/agent/tools/rules/*` - Rule CRUD operations
- `ml_feedback_scores.py` - Real-time scoring adjustments
- `ml_feedback_promote.py` - Stats → hints promotion
- `categorize_suggest.py` - Unified suggestion builder

**Data Model:**
- `ml_feedback_events` - Event stream
- `ml_feedback_merchant_category_stats` - Aggregates
- `merchant_category_hints` - Base suggestions (source='ml_feedback' or 'user')
- `category_rules` - Regex-based rules

**Complete Learning Loop:**
```
User clicks suggestion
    ↓
POST /api/ml/feedback (fire-and-forget)
    ↓
ml_feedback_events inserted
    ↓
ml_feedback_merchant_category_stats updated
    ↓
Next suggest/batch call: ml_feedback_scores adjusts scores
    ↓
Nightly: ml_feedback_promote creates hints
    ↓
Future suggestions start from hints
    ↓
CONTINUOUS IMPROVEMENT
```

---

### ⚠️ LEGACY (Candidate for Removal)

**Frontend:**
- `RuleSuggestionsPersistentPanel.tsx` - Shows rule suggestions from old system
- `SuggestionsPanel.tsx` - Heuristic suggestions (disabled by default)

**Backend:**
- `/rules/suggestions/*` - All endpoints (config, list, accept, dismiss, apply, ignore)
- `/agent/tools/suggestions` - Heuristic mining endpoint
- `rule_suggestions.py` service
- `rule_suggestions_store.py` service
- `rule_suggestion_ignores_store.py` service

**Data Model:**
- `rule_suggestions` table - Persistent suggestion candidates
- `feedback` table - Legacy feedback (predates ml_feedback_events)
- `rule_suggestion_ignores` table - User dismissals

**Why Legacy:**
1. **Duplication:** Solves the same problem as ml_feedback system but with different tables and logic
2. **Inconsistent:** Uses old `feedback` table instead of `ml_feedback_events`
3. **Unused Data:** `rule_suggestions` table not fed by new ML feedback loop
4. **UI Confusion:** "Rule Suggestions" card often shows "No suggestions right now" because it's disconnected from actual user feedback
5. **Maintenance Burden:** Two parallel systems for the same goal

---

### 🔄 BRIDGES (Needs Alignment)

**Seed Rule Button:**
- **Current:** Emits `ruleTester:seed` event with merchant + description
- **Status:** Works correctly with new system
- **Action:** No changes needed - already aligned

**Rule Tester:**
- **Current:** Tests rules against transactions, can save as regex or hint
- **Status:** Works with both old and new systems
- **Action:** Ensure saved rules update merchant_category_hints (already does via categorize/promote endpoint)

---

## 4. Proposed Unified Model

### Vision: Single Source of Truth

**Core Principle:** `merchant_category_hints` is the canonical suggestion source, fed by:
1. **ML Feedback Promotion** (nightly job from ml_feedback_stats)
2. **User-Created Hints** (via Rule Tester → promote endpoint)
3. **Rule-Derived Hints** (optional: CategoryRule matches can seed hints)

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTIONS                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Unknowns Card              Rules Table                    │
│  • Suggestion chips         • Create rule                  │
│  • Seed rule button         • Edit/delete                  │
│  • Explain + reject         • Test rule                    │
│                                                             │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               v                          v
      ┌────────────────┐          ┌──────────────┐
      │ ML Feedback    │          │ Category     │
      │ Events         │          │ Rules        │
      └────────┬───────┘          └──────┬───────┘
               │                         │
               v                         │
      ┌────────────────┐                 │
      │ Stats          │                 │
      │ Aggregation    │                 │
      └────────┬───────┘                 │
               │                         │
               v                         │
      ┌────────────────┐                 │
      │ Nightly        │                 │
      │ Promotion      │                 │
      └────────┬───────┘                 │
               │                         │
               └────────┬────────────────┘
                        v
               ┌────────────────────┐
               │ merchant_category_ │
               │ hints              │
               │ (SINGLE SOURCE)    │
               └─────────┬──────────┘
                         │
                         v
               ┌────────────────────┐
               │ Suggestion         │
               │ Service            │
               │ (categorize_       │
               │  suggest.py)       │
               └─────────┬──────────┘
                         │
                         v
               ┌────────────────────┐
               │ Unknowns Card      │
               │ Displays           │
               │ Suggestions        │
               └────────────────────┘
```

### What Happens to "Rule Suggestions" Card?

**Option A: Repurpose (Recommended)**
- Show promotion **candidates** from `ml_feedback_merchant_category_stats`
- Display stats that don't yet meet promotion thresholds
- Allow user to manually promote or ignore
- API endpoint: `GET /admin/ml-feedback/promotion-candidates?dry_run=true`

**Option B: Remove**
- Hide the card entirely
- Users create rules via "Seed rule" button or Rules table
- Promotion happens automatically via nightly job
- Simpler UX, less surface area

**Option C: Merge into Insights**
- Show top promoted hints in Insights card
- "This month you created X new merchant patterns"
- Educational/analytics focus

---

## 5. Recommended Refactors & Tests

### Phase 1: Deprecate Legacy Suggestions (High Priority)

#### Backend Changes

1. **Mark `/rules/suggestions` endpoints as deprecated**
   - File: `apps/backend/app/routers/rule_suggestions.py`
   - Action: Add deprecation warnings to all endpoints
   - Timeline: Immediate

2. **Disable heuristic suggestions permanently**
   - File: `apps/backend/app/routers/agent_tools_suggestions.py`
   - Action: Remove router registration or add `@deprecated` decorator
   - Timeline: Immediate

3. **Create migration to drop legacy tables** (after frontend removal)
   - Tables: `rule_suggestions`, `rule_suggestion_ignores`
   - Note: Keep `feedback` table if used elsewhere, otherwise migrate to ml_feedback_events
   - Timeline: Phase 2

#### Frontend Changes

4. **Remove RuleSuggestionsPersistentPanel from App.tsx**
   - File: `apps/web/src/App.tsx` (line 405)
   - Action: Comment out or remove `<RuleSuggestionsPersistentPanel />`
   - Timeline: Immediate

5. **Remove SuggestionsPanel from App.tsx**
   - File: `apps/web/src/App.tsx` (line 398)
   - Action: Remove `<SuggestionsPanel month={month} />`
   - Timeline: Immediate

6. **Clean up legacy API calls**
   - File: `apps/web/src/lib/api.ts`
   - Functions to deprecate:
     - `listPersistedSuggestions()`
     - `acceptSuggestion()`
     - `dismissSuggestion()`
     - `listRuleSuggestions()`
     - `listRuleSuggestionsSummary()`
     - `applyRuleSuggestion()`
     - `ignoreRuleSuggestion()`
     - `fetchRuleSuggestConfig()`
   - Timeline: After frontend components removed

---

### Phase 2: Enhance ML Feedback System (Medium Priority)

#### Backend Enhancements

7. **Add promotion candidates endpoint**
   ```python
   # File: apps/backend/app/routers/admin_ml_feedback.py
   @router.get("/admin/ml-feedback/promotion-candidates")
   def get_promotion_candidates(
       min_feedback: int = 2,
       dry_run: bool = True,
       db: Session = Depends(get_db)
   ):
       """Show candidates that could be promoted with more feedback."""
       # Query ml_feedback_merchant_category_stats
       # Return items with 1 accept (need 1 more) or 60% ratio (need 10% more)
       pass
   ```
   - Timeline: 1-2 days

8. **Add bulk feedback endpoint** (optional)
   ```python
   # File: apps/backend/app/routers/ml_feedback.py
   @router.post("/api/ml/feedback/bulk")
   def record_bulk_feedback(items: List[FeedbackIn], db: Session = Depends(get_db)):
       """Record multiple feedback events in single transaction."""
       pass
   ```
   - Timeline: Optional

#### Frontend Enhancements

9. **Add promotion candidates view** (if using Option A above)
   ```typescript
   // File: apps/web/src/components/PromotionCandidatesPanel.tsx
   // New component showing ml_feedback stats that are close to promotion
   // Shows: merchant, category, accept_count, reject_count, accept_ratio
   // Actions: "Promote now" or "Ignore"
   ```
   - Timeline: 2-3 days

10. **Enhance UnknownsPanel with inline learning indicators**
    ```typescript
    // File: apps/web/src/components/UnknownsPanel.tsx
    // Add badge showing "Learning: +2 accepts" when merchant has active feedback
    // Tooltip: "This suggestion is getting smarter based on your feedback"
    ```
    - Timeline: 1 day

---

### Phase 3: Automated Promotion (Low Priority)

11. **GitHub Actions workflow for nightly promotion**
    ```yaml
    # File: .github/workflows/ml-feedback-promotion.yml
    name: ML Feedback Promotion
    on:
      schedule:
        - cron: '0 2 * * *'  # 2 AM UTC daily
    jobs:
      promote:
        runs-on: ubuntu-latest
        steps:
          - name: Run promotion script
            run: |
              docker exec ai-finance-backend \
                python -m app.scripts.promote_feedback_to_hints
    ```
    - Timeline: When deployment infrastructure supports scheduled tasks

12. **Metrics dashboard for promotion tracking**
    - Endpoint: `GET /admin/ml-feedback/metrics`
    - Returns: Daily promoted count, skip reasons, confidence distribution
    - Timeline: Future enhancement

---

### Testing Requirements

#### Unit Tests

13. **Backend: Test promotion candidate filtering**
    ```python
    # File: apps/backend/tests/test_ml_feedback_promote.py
    def test_promotion_candidates_filtering():
        # Given: Stats with varying accept/reject ratios
        # When: Querying candidates
        # Then: Only returns items meeting threshold criteria
        pass
    ```

14. **Frontend: Test UnknownsPanel feedback flow**
    ```typescript
    // File: apps/web/src/__tests__/UnknownsPanel.test.tsx
    test('applies category and sends ML feedback', async () => {
      // Given: Transaction with suggestions
      // When: User clicks suggestion chip
      // Then: 1) POST /api/txns/{id}/categorize called
      //       2) POST /api/ml/feedback called (fire-and-forget)
      //       3) Row disappears from UI
    });
    ```

#### Integration Tests

15. **E2E: Seed rule creates hint**
    ```typescript
    // File: apps/web/tests/e2e/seed-rule-flow.spec.ts
    test('seed rule from unknown creates merchant hint', async ({ page }) => {
      // Given: Unknown transaction for "STARBUCKS"
      // When: Click "Seed rule" → select "dining-out" → save
      // Then: 1) merchant_category_hints table has (starbucks, dining-out)
      //       2) Future transactions for STARBUCKS suggest dining-out
    });
    ```

16. **E2E: Feedback improves suggestions**
    ```typescript
    // File: apps/web/tests/e2e/ml-feedback-learning.spec.ts
    test('accepting suggestion improves future scores', async ({ page }) => {
      // Given: Transaction with suggestion "restaurants" (score 0.4)
      // When: Accept suggestion 2 times
      // Then: Next transaction for same merchant has score > 0.5
    });
    ```

---

## 6. Migration Checklist

### Immediate Actions (Week 1)

- [ ] Add deprecation warnings to `/rules/suggestions` endpoints
- [ ] Remove `SuggestionsPanel` from App.tsx
- [ ] Remove `RuleSuggestionsPersistentPanel` from App.tsx
- [ ] Document migration plan for users (if any rely on Rule Suggestions card)
- [ ] Create feature flag `LEGACY_RULE_SUGGESTIONS_ENABLED` (default: false)

### Short-term (Weeks 2-4)

- [ ] Implement promotion candidates endpoint
- [ ] Create PromotionCandidatesPanel component (if Option A chosen)
- [ ] Add unit tests for promotion candidate filtering
- [ ] Add E2E test for seed rule → hint creation
- [ ] Migrate any remaining `feedback` table usage to `ml_feedback_events`

### Medium-term (Months 2-3)

- [ ] Create Alembic migration to drop `rule_suggestions` table
- [ ] Create Alembic migration to drop `rule_suggestion_ignores` table
- [ ] Remove legacy API functions from `apps/web/src/lib/api.ts`
- [ ] Remove `apps/backend/app/routers/rule_suggestions.py`
- [ ] Remove `apps/backend/app/services/rule_suggestions.py`
- [ ] Remove `apps/backend/app/routers/agent_tools_suggestions.py`

### Long-term (Month 4+)

- [ ] Implement automated nightly promotion (GitHub Actions or cron)
- [ ] Add metrics dashboard for ML feedback system
- [ ] Implement hint quality decay (lower confidence for unused hints after 90 days)
- [ ] Add conflict resolution for competing suggestions

---

## 7. Risk Assessment

### Low Risk Changes

- Removing `SuggestionsPanel` - Already disabled by default (`VITE_SUGGESTIONS_ENABLED=0`)
- Deprecating `/rules/suggestions` endpoints - Likely unused in production

### Medium Risk Changes

- Removing `RuleSuggestionsPersistentPanel` - May be actively used by some users
- **Mitigation:** Add feature flag, monitor analytics for usage before removal

### High Risk Changes

- Dropping `feedback` table - May be used by other parts of system
- **Mitigation:** Audit all references to `feedback` table before migration

---

## 8. Success Criteria

### Technical Metrics

- ✅ Single suggestion pipeline: All suggestions flow through `categorize_suggest.py`
- ✅ Single feedback table: All user interactions logged in `ml_feedback_events`
- ✅ Single hint source: `merchant_category_hints` is the only suggestion source
- ✅ Zero legacy API calls: No frontend code calls `/rules/suggestions/*`

### User Experience Metrics

- ✅ Suggestion accuracy improves: Track accept rate over time
- ✅ Unknowns reduction: Fewer uncategorized transactions month-over-month
- ✅ Rule creation efficiency: Users create rules faster via Seed button
- ✅ Learning visibility: Users understand that system learns from their feedback

### Code Quality Metrics

- ✅ Reduced duplication: Remove ~800 lines of legacy suggestion code
- ✅ Simpler data model: 4 fewer database tables
- ✅ Clearer architecture: Single learning loop instead of 3 parallel systems
- ✅ Better tests: E2E coverage for complete feedback → promotion → suggestion flow

---

## Appendix A: File Inventory

### Frontend (React/TypeScript)

**Components:**
- ✅ `apps/web/src/components/UnknownsPanel.tsx` - Canonical unknowns with ML suggestions
- ⚠️ `apps/web/src/components/SuggestionsPanel.tsx` - Legacy heuristic suggestions (disabled)
- ⚠️ `apps/web/src/components/RuleSuggestionsPersistentPanel.tsx` - Legacy rule suggestions
- ✅ `apps/web/src/components/RulesPanel.tsx` - Canonical rules table
- ✅ `apps/web/src/components/SuggestionPill.tsx` - Suggestion chip component (used by UnknownsPanel)

**Hooks:**
- ✅ `apps/web/src/hooks/useUnknowns.ts` - Fetch uncategorized transactions
- ⚠️ `apps/web/src/hooks/useSuggestions.ts` - Legacy heuristic suggestions hook
- ⚠️ `apps/web/src/hooks/useMLSuggestions.ts` - Old ML suggestions hook (unused)

**API Layer:**
- `apps/web/src/lib/api.ts` - All API calls
  - ✅ Canonical: `suggestForTxnBatch()`, `mlFeedback()`, `categorizeTxn()`
  - ⚠️ Legacy: `listPersistedSuggestions()`, `listRuleSuggestions()`, etc.

### Backend (Python/FastAPI)

**Routers:**
- ✅ `apps/backend/app/routers/agent_tools_categorize.py` - Canonical suggestions
- ✅ `apps/backend/app/routers/ml_feedback.py` - Canonical feedback recording
- ✅ `apps/backend/app/routers/admin_ml_feedback.py` - Canonical promotion admin
- ⚠️ `apps/backend/app/routers/rule_suggestions.py` - Legacy rule suggestions
- ⚠️ `apps/backend/app/routers/agent_tools_suggestions.py` - Legacy heuristic suggestions
- ✅ `apps/backend/app/routers/rules.py` - Canonical rules management (with legacy suggestions code mixed in)

**Services:**
- ✅ `apps/backend/app/services/categorize_suggest.py` - Canonical suggestion builder
- ✅ `apps/backend/app/services/ml_feedback_scores.py` - Real-time scoring
- ✅ `apps/backend/app/services/ml_feedback_promote.py` - Stats → hints promotion
- ⚠️ `apps/backend/app/services/rule_suggestions.py` - Legacy suggestions mining
- ⚠️ `apps/backend/app/services/rule_suggestions_store.py` - Legacy DB operations
- ⚠️ `apps/backend/app/services/rule_suggestion_ignores_store.py` - Legacy ignores

**Scripts:**
- ✅ `apps/backend/app/scripts/promote_feedback_to_hints.py` - Canonical promotion CLI

### Database Tables

**Canonical:**
- `ml_feedback_events` - User feedback events (created: manual SQL)
- `ml_feedback_merchant_category_stats` - Aggregated feedback stats (created: manual SQL)
- `merchant_category_hints` - Base suggestions (existing table, new source='ml_feedback' values)
- `category_rules` - Regex-based rules (existing table)
- `transactions` - Transaction data (existing table)

**Legacy:**
- `rule_suggestions` - Persistent suggestion candidates (to be dropped)
- `rule_suggestion_ignores` - User dismissals (to be dropped)
- `feedback` - Old feedback table (audit before dropping - may be used elsewhere)

---

## Appendix B: Deployment Commits (ML Feedback System)

Complete implementation history for reference:

1. `419c0b00` - ML feedback endpoint (logging-only, initial)
2. `118262d8` - ML feedback models (events + stats tables)
3. `5d3cd51d` - Migration fix
4. `c0272aa8` - Router /api prefix fix
5. `086913f3` - ML feedback scoring module + tests
6. `0ebcc543` - **Scoring integration into suggestions** ← Real-time learning enabled
7. `190def0a` - Environment variable `ML_FEEDBACK_SCORES_ENABLED`
8. `a239b424` - **Nightly promotion service** ← Complete learning loop

**Current Production State:**
- All 8 commits deployed (2025-11-20T21:38:20Z)
- ML feedback scoring: ✅ Active
- Nightly promotion: ✅ Available (manual runs)
- Automated cron: ⏳ Future enhancement

---

## Conclusion

LedgerMind has successfully implemented a **modern ML feedback system** that learns from user interactions in real-time. The legacy rule suggestions systems (`/rules/suggestions`, `/agent/tools/suggestions`) are **redundant and should be deprecated**.

**Recommended Path Forward:**
1. **Immediate:** Remove legacy UI components (SuggestionsPanel, RuleSuggestionsPersistentPanel)
2. **Short-term:** Add promotion candidates view if desired (Option A) or simplify UX (Option B)
3. **Medium-term:** Drop legacy tables and services
4. **Long-term:** Automate nightly promotion and add metrics dashboard

This will result in a **simpler, more maintainable codebase** with a **single, cohesive learning system** that continuously improves suggestions based on actual user behavior.
