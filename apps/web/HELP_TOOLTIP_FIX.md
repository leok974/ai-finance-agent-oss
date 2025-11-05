# Help Tooltip Fix - API Route & Deterministic Copy

## Problem

1. **404 errors to `/help`**: `HelpTooltip` was POSTing to `/help` route that doesn't exist. The backend exposes `POST /agent/describe/<key>` (with optional `?rephrase=1`).

2. **"What" tab showed placeholder**: Card keys weren't in the deterministic copy map, so it fell back to a generic sentence.

3. **LLM unavailable errors**: The 404 bubbled up and showed "LLM unavailable" message.

## Solution

### A) Added correct API route

**File**: `apps/web/src/lib/api.ts`

Added new `agentDescribe()` function:

```typescript
export async function agentDescribe(
  key: string,
  body: Record<string, unknown> = {},
  opts?: { rephrase?: boolean }
) {
  const qs = opts?.rephrase ? '?rephrase=1' : '';
  return fetchJSON(`agent/describe/${encodeURIComponent(key)}${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
```

### B) Complete rewrite of CardHelpTooltip

**File**: `apps/web/src/components/CardHelpTooltip.tsx`

**Key Changes:**

1. **Deterministic WHAT map** - Added copy for all card types:
   - `cards.overview` - "Shows total inflows (income), total outflows (spend), and net for the selected month..."
   - `charts.top_categories` - "Top spending categories for the selected month..."
   - `charts.month_merchants` - "Top merchants by spend for the selected month..."
   - `charts.daily_flows` - "Daily net = income − spend for the selected month..."
   - `charts.spending_trends` - "Multi-month trend of total spend and/or net..."
   - `cards.forecast` - "Forecast projects future net/in/out using your selected model..."

2. **LLM gating** - Uses `useLlmStore` to check `modelsOk` before calling LLM:
   ```typescript
   const modelsOk = useLlmStore((s) => s.modelsOk);
   ```

3. **Why tab implementation**:
   - Only fetches when tab is active AND `modelsOk === true`
   - Calls `agentDescribe(cardId, { month }, { rephrase: true })`
   - Shows friendly "temporarily unavailable" message when LLM is down
   - Disabled state when `!modelsOk`

4. **What tab implementation**:
   - Shows deterministic copy immediately (no API call)
   - Displays "DETERMINISTIC" badge
   - Always available, no loading state needed

### C) Removed legacy code

Deleted:
- `apps/web/src/lib/helpTooltip.js` - Old implementation calling `/help`
- `apps/web/src/lib/helpTooltip.d.ts` - Type declarations for old code

### D) Added Playwright tests

**File**: `apps/web/tests/e2e/help-tooltip.spec.ts`

Three test scenarios:
1. **Deterministic What + LLM Why** - Verifies both tabs work correctly
2. **Why tab unavailable** - Verifies graceful fallback when LLM is down
3. **What tab for each card** - Verifies deterministic content shows for all cards

## Result

✅ **No more 404s** - Uses correct `/agent/describe/<key>` endpoint

✅ **"What" tab explains each card** - Deterministic copy for all 6 card types

✅ **"Why" tab only calls when LLM is available** - No wasted requests, clean fallback

✅ **Proper error handling** - Friendly "temporarily unavailable" message instead of errors

## Card Keys and Their Help Text

| Card Key | What Text (Deterministic) |
|----------|---------------------------|
| `cards.overview` | Shows total inflows (income), total outflows (spend), and net for the selected month. Values update after CSV ingest or month change. |
| `charts.top_categories` | Top spending categories for the selected month. Amounts are outflows (absolute value of negatives). Click a row to filter transactions. |
| `charts.month_merchants` | Top merchants by spend for the selected month. Helps identify where most money went. |
| `charts.daily_flows` | Daily net = income − spend for the selected month. Use it to spot spikes and streaks. |
| `charts.spending_trends` | Multi-month trend of total spend and/or net. Useful for seasonality and month-over-month changes. |
| `cards.forecast` | Forecast projects future net/in/out using your selected model, horizon, and confidence band. |

## API Contract

### Backend Endpoint
```
POST /agent/describe/{key}?rephrase=1
Body: { "month": "2024-10", ... }
Response: { "why": "...", "reply": "...", "text": "..." }
```

### Frontend Usage
```typescript
import { agentDescribe } from '@/lib/api';

const res = await agentDescribe(
  'charts.top_categories',
  { month: '2024-10' },
  { rephrase: true }
);
```

## Testing

Run Playwright tests:
```bash
pnpm -C apps/web test:e2e
```

Or run specific help tooltip tests:
```bash
pnpm -C apps/web exec playwright test help-tooltip.spec.ts
```

## Migration Notes

- All cards using `CardHelpTooltip` will automatically benefit from the fix
- No changes needed to card components themselves
- The `baseText` prop is now deprecated but kept for backward compatibility
- `ctx` prop is no longer used but kept to avoid breaking existing code
