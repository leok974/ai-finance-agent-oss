# LedgerMind – Unknowns Suggestions & ML Feedback (Snapshot v1)

**Goal:** Make uncategorized suggestion chips feel like a real, learning assistant:
click → category applied → row disappears → feedback logged → future scores adapt.

## Current UX & Behavior

- **Scope**
  - Unknowns card (Uncategorized transactions)
  - Suggestion chips from `/agent/tools/categorize/suggest/batch`
  - "Seed rule" button → opens rule tester prefilled
  - "Explain" button → unified explanation + "Don't suggest this" feedback

- **Suggestion chips**
  - `POST /api/txns/{id}/categorize` applies category.
  - Row disappears in-session via `dismissedTxnIds` + derived `visibleUnknowns`.
  - `POST /api/ml/feedback` (best-effort) logs:
    - `action: "accept"` on suggestion click
    - `action: "reject"` on "Don't suggest this"
  - If categorize fails → toast + row stays.
  - If feedback fails → error logged, row still disappears.

- **E2E status (@prod)**
  - Suggestions load from backend and render as chips (conditionally skipped when 0 unknowns).
  - Clicking chip applies category and reduces row count.
  - Seed rule opens rule tester with prefilled txn context.

## ML Feedback Data Model (Backend)

- `ml_feedback_events`
  - Per-click record: `txn_id`, `user_id`, `category`, `action`, `score?`, `model?`, `source?`, `created_at`.

- `ml_feedback_merchant_category_stats`
  - Aggregated per (`merchant_normalized`, `category`):
    - `accept_count`, `reject_count`, `last_feedback_at`.

> NOTE: Tables currently created via manual SQL; we'll add an Alembic migration later that is idempotent and/or marks them as existing.

## Scoring Integration (Implemented)

- Helper module `apps/backend/app/services/ml_feedback_scores.py`:
  - `FeedbackKey(merchant_normalized, category)`
  - `FeedbackStats(accept_count, reject_count, last_feedback_at)`
  - `load_feedback_stats_map(db, keys)` – batch-loads all stats in single query
  - `adjust_score_with_feedback(base_score, merchant_normalized, category, stats)`:
    - Boost: `+0.20 * log1p(accept_count)`
    - Penalty: `-0.30 * log1p(reject_count)`
    - Recency bonus: `+0.05` if feedback within last 30 days

- Integration into suggestions service:
  - For each suggestion: ensure `merchant_normalized` + `category_slug`.
  - Collect `FeedbackKey` across batch; call `load_feedback_stats_map()` once.
  - Adjust scores with `adjust_score_with_feedback()` and re-sort per transaction.
  - Guard behind `ML_FEEDBACK_SCORES_ENABLED` environment variable (default: `"1"`).

## Architecture

```
┌─────────────────┐
│  Frontend       │
│  UnknownsPanel  │
└────────┬────────┘
         │ Click chip
         ├─────────────────────────────────┐
         │                                 │
         v                                 v
┌────────────────────┐          ┌──────────────────────┐
│ POST /api/txns/    │          │ POST /api/ml/        │
│ {id}/categorize    │          │ feedback             │
└────────┬───────────┘          └──────────┬───────────┘
         │                                 │
         │ Success                         │ Fire-and-forget
         │                                 │
         v                                 v
┌────────────────────┐          ┌──────────────────────┐
│ Row dismissed      │          │ ml_feedback_events   │
│ (session-level)    │          │ +                    │
└────────────────────┘          │ ml_feedback_         │
                                │ merchant_category_   │
                                │ stats                │
                                └──────────┬───────────┘
                                           │
                                           v
                               ┌───────────────────────┐
                               │ Future suggestions    │
                               │ use adjusted scores   │
                               └───────────────────────┘
```

## Open Items

1. **Wire feedback stats into suggestion scoring**
   - ✅ Implemented `ml_feedback_scores.py` (commit 086913f3)
   - ⏳ Call it from suggestions service when env flag enabled
   - Add `ML_FEEDBACK_SCORES_ENABLED=1` to production environment

2. **Migrations alignment**
   - ⏳ Add Alembic migration that:
     - Creates `ml_feedback_events` and `ml_feedback_merchant_category_stats` if missing, OR
     - Marks them as present when they already exist.
   - Current status: Tables created via manual SQL (production-ready)

3. **Deterministic Unknowns E2E data (optional)**
   - Add dev/test seed endpoint to create at least one uncategorized transaction.
   - In non-prod tests, call seed route instead of relying on ambient data.
   - Keep current skip behavior in true prod runs.

## Testing

**Unit Tests** (`apps/backend/tests/test_ml_feedback_scores.py`):
- ✅ No stats → base score unchanged
- ✅ Accepts increase score
- ✅ Rejects decrease score
- ✅ Recent feedback adds recency bonus
- ✅ Old feedback (>30 days) no bonus
- ✅ Balanced feedback (reject penalty dominates)

**E2E Tests** (`apps/web/tests/e2e/unknowns-interactions.spec.ts`):
- ✅ Suggestions render as clickable chips
- ✅ Clicking chip categorizes transaction
- ✅ Row disappears after successful categorization
- ✅ Seed rule opens with prefilled context

## Deployment Status

| Component | Status | Version |
|-----------|--------|---------|
| Frontend | ✅ Deployed | 73d58196 |
| Backend (ML Feedback Router) | ✅ Deployed | c0272aa8 |
| Backend (ML Feedback Models) | ✅ Deployed | 118262d8 |
| Backend (ML Feedback Scoring) | ✅ Committed | 086913f3 |
| Database Tables | ✅ Created | Manual SQL |
| Scoring Integration | ⏳ Pending | - |

## Maintenance Notes

**Environment Variables:**
- `ML_FEEDBACK_SCORES_ENABLED=1` – Enable feedback-based scoring adjustments
- Default behavior if unset: scoring **enabled**

**Database Monitoring:**
```sql
-- Check recent feedback activity
SELECT 
    merchant_normalized,
    category,
    accept_count,
    reject_count,
    last_feedback_at
FROM ml_feedback_merchant_category_stats
ORDER BY last_feedback_at DESC
LIMIT 20;

-- Check total feedback events
SELECT COUNT(*) FROM ml_feedback_events;
SELECT action, COUNT(*) FROM ml_feedback_events GROUP BY action;
```

**Performance Considerations:**
- Feedback stats are batch-loaded (single query per suggestion request)
- No N+1 queries even with many suggestions
- Stats table has composite unique index on (merchant_normalized, category)
- Feedback recording is fire-and-forget (never blocks categorization)

## Future Enhancements

1. **Model-specific scoring**
   - Track which ML model generated each suggestion
   - Adjust scores differently based on model reliability

2. **User-specific learning**
   - Personalize suggestions based on individual user patterns
   - Requires user_id in feedback stats aggregation

3. **Category transitions**
   - Learn merchant category changes over time
   - Detect and adapt to business model changes

4. **Confidence calibration**
   - Use feedback to calibrate model confidence scores
   - Improve reliability of uncertainty estimates
