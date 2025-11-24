# Category Colors Update

## Summary

Updated the frontend charts to use semantic category colors instead of magnitude-based color gradients. Categories now have consistent, meaningful colors that match their definitions.

## Changes

### Frontend

1. **Added missing categories to `categories.ts`**:
   - `entertainment` (purple-500: #a855f7)
   - `utilities` (violet-500: #8b5cf6)
   - `healthcare` (pink-500: #ec4899)
   - `unknown` (slate-400: #94a3b8)

2. **Updated Top Categories chart** (`ChartsPanel.tsx`):
   - Replaced magnitude-based `pickColor()` with semantic `getCategoryColor()`
   - Categories now use their defined colors from `CATEGORY_DEFS`
   - Before: Green (low) → Amber (medium) → Red (high) based on spend amount
   - After: Groceries=emerald, Restaurants=red, Subscriptions=indigo, etc.

3. **Updated Top Merchants chart** (`ChartsPanel.tsx`):
   - Added `category` field to `MerchantChartRow` and `MerchantChartRowGrouped` types
   - Passed category from backend API through merchant normalizer
   - Merchants now colored by their primary category
   - Fallback to 'unknown' (gray) if no category available

4. **Removed unused code**:
   - Removed `pickColor()` function (no longer needed)
   - Kept `maxMerchant` and `maxCategory` for potential future use

### Type Updates

**`apps/web/src/lib/merchant-normalizer.ts`**:
```typescript
export interface MerchantChartRow {
  merchantRaw: string;
  spend: number;
  txns: number;
  category?: string; // NEW: category slug from backend
}

export interface MerchantChartRowGrouped {
  merchant: string;
  spend: number;
  txns: number;
  kind?: MerchantKind;
  categoryHint?: MerchantCategoryHint;
  category?: string; // NEW: preserved from backend
}
```

## Visual Impact

### Before
- **Top Categories**: Bars colored by spend magnitude
  - High spenders: Red
  - Medium spenders: Amber/Yellow
  - Low spenders: Green
  - **Issue**: Can't distinguish categories visually, only by label

- **Top Merchants**: Bars colored by spend magnitude
  - Same red/amber/green gradient
  - **Issue**: Similar merchants (e.g., grocery stores) can have different colors

### After
- **Top Categories**: Bars colored by category identity
  - Groceries: Always emerald green (#10b981)
  - Restaurants: Always red (#ef4444)
  - Subscriptions: Always indigo (#6366f1)
  - Income: Always green (#22c55e)
  - Transportation: Always amber (#f59e0b)
  - Unknown: Always gray (#94a3b8)

- **Top Merchants**: Bars colored by primary category
  - All grocery merchants: Emerald
  - All restaurants: Red
  - All subscriptions: Indigo
  - Transfers/P2P: As per transfer category
  - Unknown category: Gray

## Benefits

1. **Visual Consistency**: Categories have the same color across all charts
2. **Better Recognition**: Users can identify categories at a glance
3. **Semantic Meaning**: Colors match category semantics (groceries=green, subscriptions=indigo)
4. **Demo Data Impact**: The upgraded demo data (20 categories) now shows visually distinct colors
5. **Legend Alignment**: Chart bars match category definitions in the codebase

## Testing

- ✅ TypeScript type checking passes
- ✅ All 324 frontend unit tests pass
- ✅ No compilation errors
- ✅ Backward compatible (falls back to gray for unknown categories)

## Demo Data Compatibility

This change works seamlessly with the demo data upgrade (commit 091312a6):
- Demo has 20 unique categories (groceries, restaurants, shopping, entertainment, etc.)
- Each category now displays with its distinctive color
- Charts are more visually interesting and informative
- Users can see spending patterns by color, not just by label

## Next Steps

1. Manual QA in browser to verify visual appearance
2. Consider adding category color legend to charts
3. Backend part 2: Demo finance tool (agent can describe demo category averages)
