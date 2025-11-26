# Production Smoke Test - Agent Streaming

## Purpose
Verify that all chip handlers return deterministic data (not LLM fallbacks) after the streaming refactor.

## Prerequisites
1. Backend running: `docker ps | grep ai-finance-backend` should show healthy
2. You're logged in at http://localhost:8083

## Test Procedure

### Critical Test: Analytics Trends (Fixed in commit 6922f7d2)

**This is the chip we just fixed (3 iterations). Test this first!**

1. Navigate to http://localhost:8083
2. Log in if needed
3. Open the chat interface
4. Click the **"Trends"** chip (or type "Show my spending trends")
5. **Expected behavior**:
   - ✅ Should see deterministic response based on your data:
     - **If 0 transactions**: "I don't have any transaction data for November 2025..."
     - **If 1 month of data**: "Limited history but here's summary: $X spent..."
     - **If ≥2 months**: "Spending trends from X to Y... Average: $Z..."
   - ✅ Should see streaming tokens appear character-by-character
   - ❌ Should NOT see: "I can help you analyze..." or other LLM fallback language

6. **Check chat JSON** (open browser DevTools → Network → agent/stream):
   ```json
   {"type":"planner","data":{"intent":"analytics","mode":"analytics_trends"}}
   {"type":"tool_start","data":{"name":"load_month"}}
   {"type":"token","data":{"text":"L"}}
   {"type":"token","data":{"text":"i"}}
   ...
   {"type":"tool_end","data":{"ok":true}}
   {"type":"done","data":{}}
   ```

### Other Chips to Test

Test each of these chips and verify they return real data:

| Chip | Expected Behavior | Pass/Fail |
|------|-------------------|-----------|
| **Month Summary** | Shows spend/income/net + top categories | ☐ |
| **Trends** | Shows spending trends or "limited history" | ☐ |
| **Alerts** | Lists alerts or "no alerts for this month" | ☐ |
| **Recurring** | Shows top merchants by frequency | ☐ |
| **Subscriptions** | Shows recurring merchant patterns | ☐ |
| **Insights (Q)** | Compact summary with spend/income | ☐ |
| **Budget Suggest** | 50/30/20 breakdown or "need data" | ☐ |

### Red Flags (FAIL indicators)

❌ **LLM Fallback Language** (bad - means deterministic handler didn't work):
- "I can help you identify recurring charges..."
- "Let me analyze your spending patterns..."
- "I'll check your transaction history..."
- "Based on the data available, I can see..."

✅ **Deterministic Language** (good - means handler worked):
- "I don't have any transaction data for..."
- "Here are your top recurring merchants by frequency..."
- "Based on 24 transactions in November 2025..."
- "Your spending for November 2025: $X..."

### Backend Log Verification

Check backend logs for correct mode detection:

```powershell
docker logs ai-finance-backend --tail 100 | Select-String -Pattern "agent_stream|detected_mode|analytics_trends"
```

**Expected log pattern** when clicking Trends chip:
```
INFO: [agent_stream] detected_mode=analytics_trends q=Show my spending trends
INFO: [analytics_trends] month=2025-11 txn_count_month=24 txn_count_all=24
INFO: [agent_stream] Using deterministic response (len=XXX)
```

**Bad log pattern** (means falling through to LLM):
```
INFO: [agent_stream] detected_mode=analytics_trends
WARNING: [agent_stream] Deterministic trends failed: ...
INFO: [agent_stream] No deterministic response, falling through to LLM
```

## Quick Database Check

Verify you have transaction data:

```bash
docker exec -it lm-postgres psql -U lm_user -d lm_local -c "SELECT user_id, COUNT(*) as txn_count FROM transactions WHERE month='2025-11' GROUP BY user_id;"
```

Expected output should show your user_id with transaction count > 0.

## Success Criteria

✅ **All chips return deterministic responses** when data is available
✅ **No LLM fallback language** in deterministic modes
✅ **Streaming structure intact** (planner → tool_start → tokens → tool_end → done)
✅ **Backend logs show** "Using deterministic response"

❌ **Failure indicators**:
- Chips showing "I can help you..." language when data exists
- Backend logs showing "falling through to LLM"
- Missing planner/tool events in chat JSON
- Trends chip still broken after 3 fix iterations

## What We Fixed

### Commit History (Most Recent Session)
1. `d3f307f8` - Comprehensive streaming refactor (removed legacy blocking endpoints)
2. `ea8ec352` - Fixed trends structure (iteration 1: moved logic outside `_opt_charts`)
3. `6922f7d2` - Fixed trends duplicate check (iteration 3: removed overwriting logic)

### Problem We Solved
**Before**: Trends chip had duplicate `txn_count_month == 0` check:
- Line 1768: First check (correct)
- Line 1797: Duplicate check inside `_opt_charts` block (wrong - overwrote first response)

**After**: Single check before branching, clean 4-case structure.

## Troubleshooting

### If Trends Still Shows LLM Response:

1. Check backend logs for errors:
   ```powershell
   docker logs ai-finance-backend --tail 200
   ```

2. Verify `_opt_charts` module loaded:
   ```
   INFO: [agent_stream] _opt_charts module: <module 'app.routers.charts'...>
   ```

3. Check transaction count in database (see above)

4. Verify mode is being passed correctly (Network tab → agent/stream → Query Params)

5. If all else fails: restart backend
   ```powershell
   docker compose -f docker-compose.prod.yml restart backend
   ```

## Report Results

After testing, report back:
- ✅ All chips work correctly
- ⚠️ Some chips still showing LLM fallbacks (specify which ones)
- ❌ Trends chip still broken (we need iteration 4)
