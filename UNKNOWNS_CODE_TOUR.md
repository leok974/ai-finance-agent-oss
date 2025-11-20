# Code Tour: Uncategorized Transactions (UnknownsPanel)

## Quick Reference Guide

### Where is the "Uncategorized transactions" card?

**File**: `apps/web/src/components/UnknownsPanel.tsx`
**Rendered in**: `apps/web/src/App.tsx` line 397
**Component name**: `<UnknownsPanel month={month} refreshKey={refreshKey} />`

---

## Feature 1: "Seed rule" Button → Opens Rule Creation Flow

### Click Handler (UnknownsPanel.tsx lines 50-61)
```typescript
function seedRuleFromRow(row: UnknownTxn) {
  const draft = seedRuleFromTxn({
    merchant: row.merchant ?? undefined,
    description: row.description ?? undefined,
  }, { month: currentMonth || month })

  emitToastSuccess(t('ui.toast.seed_rule_title'), {
    description: t('ui.toast.seed_rule_description'),
    action: {
      label: t('ui.toast.seed_rule_action_open'),
      onClick: () => (window as any).__openRuleTester?.(draft),
    },
  })
}
```

### Button JSX (UnknownsPanel.tsx lines 163-175)
```tsx
<Button
  type="button"
  variant="pill-outline"
  size="sm"
  onClick={()=> seedRuleFromRow(tx)}
  aria-label={t('ui.unknowns.seed_rule_aria')}
>
  {t('ui.unknowns.seed_rule')}
</Button>
```

### Helper Function (lib/rulesSeed.ts)
```typescript
export function seedRuleFromTxn(txn: TxnLike, opts?: { month?: string }) {
  const draft: SeedDraft = {
    name: txn.merchant ? `If merchant contains "${txn.merchant}"` : "New rule",
    when: {
      ...(txn.merchant ? { merchant: txn.merchant } : {}),
      ...(txn.description ? { description: txn.description } : {}),
    },
    then: { ...(txn.category_guess ? { category: txn.category_guess } : {}) },
    ...(opts?.month ? { month: opts.month } : {}),
  };

  (window as any).__pendingRuleSeed = draft;
  (window as any).__openRuleTester?.(draft);
  window.dispatchEvent(new CustomEvent('ruleTester:seed', { detail: draft }));
  return draft;
}
```

**What happens**:
1. User clicks "Seed rule"
2. `seedRuleFromRow()` extracts merchant/description
3. `seedRuleFromTxn()` creates rule draft
4. Dispatches `ruleTester:seed` event
5. Rule builder catches event and opens with pre-filled data
6. Toast appears with "Open" button as fallback

---

## Feature 2: Suggestion Pills → Apply Categories

### Pill Rendering (UnknownsPanel.tsx lines 194-202)
```tsx
<div className="flex flex-wrap gap-2 justify-start">
  {Array.isArray(suggestions[tx.id]) && suggestions[tx.id].slice(0,3).map((sug, idx) => (
    <SuggestionPill
      key={`${tx.id}-sug-${idx}`}
      txn={{
        id: tx.id,
        merchant: tx.merchant || '',
        description: tx.description || '',
        amount: tx.amount
      }}
      s={{
        category_slug: sug.category_slug,
        label: sug.label || sug.category_slug,
        score: sug.score,
        why: sug.why || []
      }}
      onApplied={(id: number)=> onSuggestionApplied(id, sug.category_slug)}
    />
  ))}
</div>
```

### SuggestionPill Component (components/SuggestionPill.tsx)
```tsx
export default function SuggestionPill({ txn, s, onApplied }) {
  return (
    <button
      className="inline-flex items-center gap-2 px-3 py-1 rounded-2xl border font-medium text-xs
                 border-slate-700 bg-slate-900/80 text-slate-100
                 hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-100
                 transition-all duration-150 ease-out hover:-translate-y-px cursor-pointer"
      title={(s.why || []).join(' • ')}
      onClick={async () => {
        await applyCategory(txn.id, s.category_slug);
        onApplied(txn.id);
      }}
    >
      <span className="font-medium">{s.label}</span>
      <span className="opacity-70">{Math.round(s.score * 100)}%</span>
    </button>
  );
}
```

### API Call (lib/api.ts lines 670-676)
```typescript
export const categorizeTxn = (id: number, category: string) => http(`/txns/${id}/categorize`, {
  method: 'POST',
  body: JSON.stringify({ category, category_slug: category })
})

export const applyCategory = (id: number, category_slug: string) => categorizeTxn(id, category_slug);
```

### Callback (UnknownsPanel.tsx lines 86-97)
```typescript
const onSuggestionApplied = async (id: number, category: string) => {
  try {
    // Send ML feedback for continuous learning
    await mlFeedback({ txn_id: id, category, action: 'accept' })

    // Show temporary "Learned" badge
    setLearned(prev => ({ ...prev, [id]: true }))
    setTimeout(() => {
      setLearned(prev => { const next = { ...prev }; delete next[id]; return next })
    }, 4500)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    err(t('ui.toast.ml_feedback_failed', { error: msg }))
  }

  // Refresh unknowns list
  refresh()
  onChanged?.()

  // Show success toast
  ok?.(t('ui.toast.category_applied', { category }))
  scheduleUnknownsRefresh()
}
```

**What happens**:
1. User clicks "Groceries 35%" pill
2. `applyCategory(txnId, "groceries")` → POST `/txns/{id}/categorize`
3. Backend updates transaction category
4. `mlFeedback()` sends to ML pipeline for training
5. Transaction removed from unknowns list
6. Success toast appears
7. "Learned" badge briefly shown

---

## Feature 3: Backend-Loaded Suggestions (Not Hardcoded)

### Data Fetching (UnknownsPanel.tsx lines 63-76)
```typescript
// Batch load top suggestions for current rows
React.useEffect(() => {
  const ids = items.map(x => x.id)
  if (!ids.length) { setSuggestions({}); return }

  let aborted = false
  suggestForTxnBatch(ids)  // ← Backend API call
    .then(res => {
      if (aborted) return
      const map: Record<number, SuggestionArray> = {}
      for (const it of res?.items || []) {
        map[it.txn] = (it.suggestions || [])
      }
      setSuggestions(map)
    })
    .catch(() => { if (!aborted) setSuggestions({}) })
  return () => { aborted = true }
}, [items])
```

### API Function (lib/api.ts lines 696-701)
```typescript
export async function suggestForTxnBatch(txnIds: number[]) {
  return fetchJSON<{
    items: Array<{
      txn: number;
      suggestions: CategorizeSuggestion[]
    }>
  }>('agent/tools/categorize/suggest/batch', {
    method: 'POST',
    body: JSON.stringify({ txn_ids: txnIds }),
  });
}
```

### Backend Endpoint
**Path**: `POST /agent/tools/categorize/suggest/batch`
**Implementation**: `apps/backend/app/routers/agent_tools.py`

**Request**:
```json
{
  "txn_ids": [123, 456, 789]
}
```

**Response**:
```json
{
  "items": [
    {
      "txn": 123,
      "suggestions": [
        {
          "category_slug": "groceries",
          "label": "Groceries",
          "score": 0.85,
          "why": ["prior merchant pattern", "high confidence"]
        },
        {
          "category_slug": "restaurants",
          "label": "Restaurants",
          "score": 0.35,
          "why": ["fallback category"]
        }
      ]
    }
  ]
}
```

**What happens**:
1. UnknownsPanel fetches unknown transactions via `useUnknowns()`
2. useEffect triggers when `items` changes
3. Extracts all transaction IDs: `[123, 456, 789]`
4. Calls `POST /agent/tools/categorize/suggest/batch`
5. Backend ML model analyzes each transaction
6. Returns top 3-5 suggestions per transaction
7. Component stores in `suggestions` state
8. Renders top 3 as clickable pills

---

## Data Flow Summary

```
┌──────────────────────────────────────────────────────────┐
│ 1. User navigates to Dashboard                          │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 2. UnknownsPanel.tsx renders                            │
│    - useUnknowns() fetches transactions from backend     │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 3. useEffect triggers suggestForTxnBatch([ids...])      │
│    POST /agent/tools/categorize/suggest/batch           │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 4. Backend ML model generates suggestions                │
│    Returns: {items: [{txn: 123, suggestions: [...]}]}   │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 5. Component renders transactions with:                  │
│    - Merchant, description, amount, date                 │
│    - "Seed rule" button                                  │
│    - "Explain" button                                    │
│    - 0-3 suggestion pills (Groceries 35%, etc.)          │
└──────────────────────────────────────────────────────────┘
                         ↓
        ┌───────────────┴──────────────┐
        ↓                               ↓
┌─────────────────┐           ┌─────────────────┐
│ User clicks     │           │ User clicks     │
│ "Seed rule"     │           │ suggestion pill │
└─────────────────┘           └─────────────────┘
        ↓                               ↓
┌─────────────────┐           ┌─────────────────┐
│ seedRuleFromTxn │           │ applyCategory   │
│ creates draft   │           │ POST /txns/{id} │
└─────────────────┘           └─────────────────┘
        ↓                               ↓
┌─────────────────┐           ┌─────────────────┐
│ Dispatch event  │           │ mlFeedback      │
│ ruleTester:seed │           │ POST /ml/...    │
└─────────────────┘           └─────────────────┘
        ↓                               ↓
┌─────────────────┐           ┌─────────────────┐
│ Rule builder    │           │ refresh()       │
│ opens (if ready)│           │ remove txn      │
└─────────────────┘           └─────────────────┘
        ↓                               ↓
┌─────────────────┐           ┌─────────────────┐
│ Toast: "Rule    │           │ Toast: "Applied │
│ draft created"  │           │ category"       │
└─────────────────┘           └─────────────────┘
```

---

## Files Reference

### Core Implementation
- **UnknownsPanel.tsx** (226 lines)
  - Main card component
  - Suggestion loading + rendering
  - Click handlers for Seed/Apply

- **SuggestionPill.tsx** (31 lines)
  - Reusable pill button
  - applyCategory on click

- **lib/api.ts** (1757 lines)
  - `suggestForTxnBatch()` - line 696
  - `categorizeTxn()` - line 670
  - `applyCategory()` - line 676
  - `mlFeedback()` - line 726

- **lib/rulesSeed.ts** (31 lines)
  - `seedRuleFromTxn()` - Creates rule draft
  - Dispatches event for rule builder

### Supporting Code
- **hooks/useUnknowns.ts** - Fetches uncategorized transactions
- **App.tsx** line 397 - Renders UnknownsPanel

### Tests
- **tests/e2e/unknowns-interactions.spec.ts** (NEW)
  - Verifies seed rule flow
  - Verifies suggestion application
  - Verifies backend API calls

---

## Verification Commands

### Type Check
```bash
cd apps/web
pnpm typecheck
```

### Build
```bash
cd apps/web
pnpm build
```

### Run Tests (when E2E env configured)
```bash
cd apps/web
pnpm exec playwright test tests/e2e/unknowns-interactions.spec.ts --project=chromium-prod
```

### Check API in Production
```bash
# In browser DevTools Console:
await fetch('/agent/tools/categorize/suggest/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ txn_ids: [123, 456] })
}).then(r => r.json())
```

---

## Summary

✅ **All three features are working**:
1. "Seed rule" button → Creates rule draft → Opens rule builder
2. Suggestion pills → Apply category → Update transaction → Show toast
3. Suggestions loaded from backend ML model → Not hardcoded

No changes needed—functionality already complete!
