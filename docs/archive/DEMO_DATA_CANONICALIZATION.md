# Demo Data Merchant Canonicalization Enhancement

## Summary

Enhanced the demo sample data to showcase LedgerMind's merchant canonicalization feature with realistic, messy bank-style merchant descriptions.

## Changes (Commits a873b416, 987c39e5)

### Script Enhancement
- **File**: `apps/backend/scripts/generate_demo_csv.py`
- **Added**: `CANONICAL_MERCHANTS` dictionary with 15 merchant groups
- **Each group includes**:
  - Canonical name (e.g., "Starbucks Coffee")
  - 3-5 messy bank-style variants (e.g., "STARBUCKS #1234 SAN FRANCISCO CA")
  - Default category for the merchant

### Merchant Groups (15 total)
1. **Starbucks Coffee** - restaurants
   - `STARBUCKS #1234 SAN FRANCISCO CA`
   - `STARBUCKS STORE 4321 FAIRFAX VA`
   - `POS PURCHASE STARBUCKS #5678`
   - `STARBUCKS 1234 - LATTE & SNACK`
   - `SBX MOBILE ORDER #9876`

2. **Target** - shopping.retail
3. **Amazon** - shopping.online
4. **Uber** - transportation.rideshare
5. **Lyft** - transportation.rideshare
6. **Whole Foods Market** - groceries
7. **Shell Gas Station** - fuel
8. **Netflix** - subscriptions.entertainment
9. **Spotify** - subscriptions.entertainment
10. **Chipotle** - restaurants
11. **AT&T** - utilities.mobile
12. **GitHub** - subscriptions.software
13. **PlayStation Store** - entertainment.games
14. **Steam** - entertainment.games
15. **Olive Garden** - restaurants

### Demo CSV Output
- **Total transactions**: 90
- **Date range**: June 2025 - November 2025 (6 months)
- **Unknown transactions**: 10 (for ML categorization demo)
- **Messy descriptions**: ~75 transactions now use realistic bank-style variants
- **Clean entries**: Income (ACME Corp), transfers (Rent Payment, Zelle), and health expenses remain clean

### Example Transformations

**Before (Clean)**:
```csv
2025-06-05,Whole Foods Market,Weekly groceries,-145.30,groceries
2025-06-10,Chipotle,Lunch,-32.50,restaurants
2025-06-14,Amazon,Books & supplies,-87.45,shopping.online
```

**After (Messy)**:
```csv
2025-06-05,WFM #1234 SAN FRANCISCO,Weekly groceries,-145.30,groceries
2025-06-10,CHIPOTLE MEXICAN GRILL,Lunch,-32.50,restaurants
2025-06-14,AMZN Mktp US*2J8KL9BC1,Books & supplies,-87.45,shopping.online
```

## User Experience Impact

### Transactions List
- Shows raw, messy bank-style descriptions
- Example: `STARBUCKS #1234 SAN FRANCISCO CA` instead of `Starbucks Coffee`
- Realistic experience matching actual bank feeds

### Charts (Top Merchants, Top Categories)
- Groups by canonical merchant names
- Displays clean labels: `Starbucks Coffee`, `Amazon`, `Netflix`
- Multiple variants aggregate under single canonical name
- Example: All 5 Starbucks variants group under "Starbucks Coffee"

### Demo Showcase
This enhancement demonstrates:
1. **Raw Data Challenge**: Messy bank descriptions are hard to analyze
2. **LedgerMind Solution**: Automatic canonicalization to clean merchant names
3. **Chart Clarity**: Clean, grouped merchant names in all visualizations
4. **ML Training**: 10 unknown transactions with messy names for categorization demo

## Technical Details

### Random Variant Selection
```python
def get_messy_merchant(canonical_name):
    """Get a random messy variant for a canonical merchant."""
    merchant_data = CANONICAL_MERCHANTS.get(canonical_name)
    if not merchant_data:
        return canonical_name, canonical_name

    variant = random.choice(merchant_data["variants"])
    return canonical_name, variant
```

### Data Isolation
- All demo transactions maintain `is_demo=true` flag
- Ensures no contamination of real user ML training
- Backend filters demo data from model training sets

### Unknowns for ML Demo
- 10 transactions with blank category
- 3 use canonical merchant variants (Starbucks, Target, Shell)
- 7 use non-canonical merchants (DoorDash, CVS, Panera, etc.)
- Showcases ML categorization on messy merchant names

## Deployment

**Built**: `ledgermind-web:main-a873b416`
**Deployed**: 2025-01-XX via `docker-compose.prod.yml`
**Health Check**: ✅ `/api/ready` returns 200 OK

## Testing

To verify the canonicalization showcase:

1. **Reset to demo data**:
   - Click "Reset" → "Use sample data"

2. **Check Transactions list**:
   - Should see messy names: `STARBUCKS #1234 SAN FRANCISCO CA`

3. **Check Top Merchants chart**:
   - Should show clean canonical names: `Starbucks Coffee`
   - Multiple variants should aggregate correctly

4. **Check Unknowns panel**:
   - Should have ~10 transactions
   - Some with canonical merchant variants for categorization demo

## Files Modified

- `apps/backend/scripts/generate_demo_csv.py` - Script enhancement
- `apps/web/public/demo-sample.csv` - Regenerated CSV with messy data
- `docker-compose.prod.yml` - Updated to ledgermind-web:main-a873b416

## Future Enhancements

Potential improvements:
- Add more canonical merchant groups (banks, insurance, utilities)
- Include merchant logo/icon mappings for UI
- Add merchant category hints for better auto-categorization
- Create admin UI for managing canonical merchant mappings
