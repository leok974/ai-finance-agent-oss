# ML Suggestions Testing Guide

## Overview
The ML suggestions feature displays intelligent category suggestions for uncategorized transactions directly in the transactions table.

## Components Added

### Backend
- **Config**: `SUGGEST_*` environment variables (enabled by default)
- **Models**: `SuggestionEvent`, `SuggestionFeedback` tables
- **Endpoints**:
  - `POST /agent/tools/suggestions` - Get suggestions
  - `POST /agent/tools/suggestions/feedback` - Track feedback
- **Metrics**: Prometheus metrics at `/metrics`

### Frontend
- **SuggestionChip.tsx** - Visual chip component with confidence badges
- **useMLSuggestions.ts** - React hook for fetching/managing suggestions
- **TransactionRowWithSuggestions.tsx** - Enhanced table row with inline suggestions
- **TransactionsPanel.tsx** - Integrated with ML suggestions

## Manual Testing Steps

### 1. Prerequisites
✅ Backend and nginx containers running (healthy status)
✅ Database migrations applied
✅ At least one uncategorized transaction in database

### 2. Load Transactions Page
1. Navigate to Transactions tab
2. Look for transactions with `category = null` or empty category
3. Below each uncategorized transaction, you should see a suggestions row with:
   - Gradient blue background
   - 1-3 suggestion chips (labeled categories)
   - Confidence percentage badges
   - Sparkles icon (✨)

### 3. Test Suggestion Display
**Expected Behavior:**
- Suggestions only appear for uncategorized transactions
- Each chip shows: `Category Name • XX%`
- High confidence (≥75%) → Green badge
- Lower confidence → Blue badge
- Loading state while fetching

### 4. Test Acceptance Flow
1. **Hover over a suggestion chip**
   - Should see Check (✓) and X icons appear

2. **Click the Check icon (accept)**
   - Transaction category updates immediately
   - Toast notification: "Category Applied"
   - Suggestions row disappears (transaction now categorized)
   - Transaction list refreshes

3. **Verify in database:**
   ```sql
   SELECT * FROM suggestion_events ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM suggestion_feedback ORDER BY created_at DESC LIMIT 1;
   ```
   - Should see event with `txn_id`, `candidates` JSON
   - Should see feedback with `action = 'accept'`

### 5. Test Rejection Flow
1. **Click the X icon (reject)**
   - No category update (transaction remains uncategorized)
   - Feedback tracked in database
   - Suggestions remain visible

2. **Verify feedback:**
   ```sql
   SELECT * FROM suggestion_feedback WHERE action = 'reject';
   ```

### 6. Test Error Handling
**Network Error Simulation:**
1. Stop backend: `docker compose -f docker-compose.prod.yml stop backend`
2. Reload transactions page
3. Should see loading state, then gracefully handle errors
4. Restart backend: `docker compose -f docker-compose.prod.yml start backend`

### 7. Check Metrics
```bash
curl http://localhost:8000/metrics | grep suggestions
```

**Expected metrics:**
- `suggestions_total{mode="heuristic",source="live"}` - Total suggestions generated
- `suggestions_covered` - Transactions with suggestions
- `suggestions_accept` - Accepted suggestions
- `suggestions_reject` - Rejected suggestions
- `suggestions_latency_seconds_*` - Latency buckets

### 8. Verify Heuristic Rules
Create test transactions with these merchants to verify rules fire:

| Merchant | Expected Category | Confidence |
|----------|------------------|------------|
| Costco | Groceries | ~90% |
| Whole Foods | Groceries | ~90% |
| Shell | Transportation | ~85% |
| Uber | Transportation | ~85% |
| Netflix | Entertainment | ~90% |
| Spotify | Entertainment | ~90% |
| Target | Shopping | ~80% |

**Regex Rules:**
- Memo contains "coffee" → Dining (80%)
- Memo contains "pharmacy|drug" → Healthcare (85%)
- Memo contains "gym|fitness" → Healthcare (75%)

### 9. UI/UX Validation

**Visual Checks:**
- ✅ Suggestion row has distinct background (gradient blue)
- ✅ Chips have proper spacing and hover effects
- ✅ Loading spinner appears during API calls
- ✅ Toast notifications are clear and helpful
- ✅ No layout shift when suggestions appear
- ✅ Mobile responsive (if applicable)

**Interaction Checks:**
- ✅ Accept/reject icons only appear on hover
- ✅ Smooth opacity transitions
- ✅ No duplicate API calls
- ✅ Fast response time (<500ms typical)

### 10. Edge Cases

**Empty Suggestions:**
- Transaction with no matching rules → Should get "General" fallback (55% confidence)

**Multiple Uncategorized:**
- Load page with 10+ uncategorized transactions
- Verify all show suggestions
- Accept one → only that row updates

**Pagination:**
- Navigate to page 2
- Suggestions should load for new page

**Search/Filter:**
- Use search to filter transactions
- Suggestions should still work for filtered results

## Known Issues / Limitations

1. **Model Serving**: Currently uses heuristic suggester only. ML model inference placeholder exists but not connected.
2. **Batch Loading**: Suggestions fetched individually per transaction (could optimize with batch endpoint).
3. **Caching**: No client-side caching yet (refetches on every page load).
4. **Shadow Mode**: Shadow predictions tracked but not displayed in UI.

## Next Steps for Production

1. **Train ML Model**: Create joblib model from historical transaction data
2. **Enable Model Mode**: Set `SUGGEST_MODE=model` or `SUGGEST_MODE=auto`
3. **Monitor Metrics**: Set up Grafana dashboards for suggestion quality
4. **A/B Testing**: Use canary rollout to compare heuristic vs model
5. **User Feedback Loop**: Analyze accept/reject patterns to improve model
6. **Performance**: Add batch endpoint for bulk suggestion requests
7. **Caching**: Implement Redis cache for frequent suggestions

## Troubleshooting

### Suggestions Not Appearing
1. Check backend health: `docker compose -f docker-compose.prod.yml ps`
2. Check logs: `docker compose -f docker-compose.prod.yml logs backend -f`
3. Verify config: `SUGGEST_ENABLED=true` in backend container
4. Check browser console for API errors
5. Verify transaction has `category = null`

### API Errors
```bash
# Test endpoint directly
curl -X POST http://localhost:8000/agent/tools/suggestions \
  -H "Content-Type: application/json" \
  -d '{"txn_ids": [123]}'
```

### Database Issues
```sql
-- Check tables exist
\dt suggestion*

-- Check recent events
SELECT * FROM suggestion_events ORDER BY created_at DESC LIMIT 5;

-- Check feedback
SELECT action, COUNT(*) FROM suggestion_feedback GROUP BY action;
```

## Success Criteria ✅

- [x] Suggestions display for uncategorized transactions
- [x] Accept flow updates category and tracks feedback
- [x] Reject flow tracks feedback without updating category
- [x] UI is responsive and user-friendly
- [x] Metrics tracked in Prometheus
- [x] Database events persisted correctly
- [x] Error handling graceful
- [ ] End-to-end testing with real user workflows
- [ ] Performance validated with 100+ transactions

## Demo Video / Screenshots
(TODO: Add screenshots of suggestion chips in action)
