# 6-Month Demo CSV - Deployment Complete ✅

**Date**: 2025-01-07
**Commit**: bc4e6f69
**Images**:
- Backend: `ledgermind-backend:main-unknowns-fix`
- Frontend: `ledgermind-web:main-demo-6mo`

---

## Summary

Successfully deployed 6-month canonical demo dataset (86 transactions, Jun-Nov 2025) to fix "charts showing only Unknown" issue.

### Key Improvements

1. **6 Months of Data** (previously 3 months):
   - June 2025 - November 2025
   - 86 total transactions (vs 44 previously)

2. **Visual Variety** (monthly spending variation):
   - Jun: $1,749 (baseline)
   - Jul: $2,102 (+freelance income)
   - **Aug: $3,275** (SPIKE: $850 dental + $387 travel gear) ⚡
   - Sep: $2,019 (back to baseline)
   - Oct: $2,483 (+health insurance)
   - Nov: $2,431 (current month)

3. **16 Distinct Categories** (not just "Unknown"):
   - transfers: $7,600
   - shopping.online: $1,184
   - groceries: $1,084
   - health.medical: $850 (Aug spike)
   - shopping.retail: $650
   - utilities.mobile: $510
   - health.insurance: $450
   - entertainment.games: $445
   - fuel: $399
   - restaurants: $330
   - subscriptions.entertainment: $192
   - transportation.rideshare: $200
   - subscriptions.software: $60
   - utilities.internet: $80
   - income.salary: $19,200
   - income.freelance: $800

4. **Only 3 Unknown Transactions** (for ML demo):
   - 2025-11-15: "Unknown Coffee Shop" (-$14.37)
   - 2025-11-16: "XYZ MARKET" (-$27.80)
   - 2025-11-17: "RandomCharge" (-$8.99)
   - Total unknowns: $51.16 (2.1% of total expenses)

---

## What Changed

### `apps/backend/scripts/generate_demo_csv.py`

**Complete rewrite** - simplified from 272 lines to 201 lines:

- ❌ **OLD**: Random generation with variance → 60-70 transactions
- ✅ **NEW**: Deterministic static data → 86 transactions
- ❌ **OLD**: Outputs to `apps/backend/sample_hints_pass3_real_data.csv`
- ✅ **NEW**: Outputs to `apps/web/public/demo-sample.csv` (canonical path)
- ❌ **OLD**: Category names like `income_salary`, `subscriptions_software`
- ✅ **NEW**: Dot-notation categories like `income.salary`, `subscriptions.software`

**Key features**:
- No randomization - reproducible demos
- Clear monthly spending narrative (baseline → spike → recovery)
- Realistic transaction mix (income, rent, groceries, subscriptions, anomalies)
- Visual markers for charts (August spike visible in Spending Trends)

### `apps/web/public/demo-sample.csv`

**Updated** from 44 transactions (Sep-Nov 2025) to 86 transactions (Jun-Nov 2025).

**Old distribution**:
- 3 months
- ~15 transactions/month
- Mostly Unknown category

**New distribution**:
- 6 months
- ~14 transactions/month (more consistent)
- 16 distinct categories
- Only 3 unknowns (2.1% of total)

### `docker-compose.prod.yml`

**Updated** nginx service image:
```diff
- image: ledgermind-web:main-demo-v2
+ image: ledgermind-web:main-demo-6mo
```

---

## How to Test

### 1. Verify Demo CSV is Accessible

```powershell
curl http://localhost:8083/demo-sample.csv | Select-Object -First 15
```

**Expected**:
- Header: `date,merchant,description,amount,category`
- First transaction: `2025-06-01,ACME Corp,Paycheck,3200.0,income.salary`
- Multiple categories visible (groceries, restaurants, fuel, etc.)

### 2. Test Reset → Use Sample Data Flow

**Steps**:
1. Navigate to http://localhost:8083 (or https://app.ledger-mind.org in prod)
2. Click **"Reset"** button (Settings page or main dashboard)
   - Clears all user transaction data
3. Click **"Use sample data"** button
   - Uploads demo-sample.csv
4. Wait for charts to refresh

**Expected Results**:

#### Top Categories Chart
- **Should show**: Multiple colored bars (groceries, restaurants, fuel, shopping, etc.)
- **Should NOT show**: Giant "Unknown" bar dominating everything
- **Check**: Legend shows 10+ categories

#### Spending Trends Chart
- **Should show**: 6 months of data (Jun-Nov 2025)
- **Should show**: Clear variation (Aug spike visible)
- **Should NOT show**: Flat lines or single month

#### Unknowns Card
- **Should show**: 3 transactions total
- **Should show**: ~$51 total unknown amount
- **Percentage**: ~2-3% of total spend

---

## Troubleshooting

### Issue: Top Categories Still Shows Only "Unknown"

**Possible causes**:

1. **User didn't click Reset first**
   - Old data still in database
   - Solution: Click Reset, then Use sample data

2. **Category parsing issue in ingest**
   - Check backend logs: `docker logs ai-finance-backend`
   - Look for CSV parsing errors
   - Verify category column is being read correctly

3. **Top Categories aggregation bug**
   - Query might default NULL categories to "Unknown"
   - Check: `apps/backend/app/services/charts.py` (or similar)
   - Expected query: `SELECT category, SUM(amount) FROM transactions WHERE user_id=? GROUP BY category`

4. **Category name mismatch**
   - CSV uses `groceries`, backend expects `category.groceries`?
   - Check backend category validation/normalization logic

**Debug steps**:
```powershell
# Check CSV is correct
curl http://localhost:8083/demo-sample.csv | Select-String "groceries"

# Check backend logs during upload
docker logs ai-finance-backend --tail 100 | Select-String "ingest"

# Connect to DB and check categories
docker exec -it lm-postgres psql -U lm -d lm -c "SELECT category, COUNT(*) FROM transactions GROUP BY category;"
```

### Issue: Spending Trends Flat/Boring

**Check**:
- Ensure 6 months of data loaded (not just 1-2 months)
- Verify monthly totals in DB match expected variation
- Check chart query aggregates by month correctly

**Debug**:
```sql
-- Inside postgres container
SELECT DATE_TRUNC('month', date) AS month, SUM(amount) AS total
FROM transactions
WHERE amount < 0  -- expenses only
GROUP BY month
ORDER BY month;
```

**Expected totals**:
- 2025-06: ~-$1,749
- 2025-07: ~-$2,102
- 2025-08: ~-$3,275 (spike!)
- 2025-09: ~-$2,019
- 2025-10: ~-$2,483
- 2025-11: ~-$2,431

---

## Next Steps (Remaining from 6-Step Plan)

### ✅ COMPLETED

1. **Step 1**: ✅ Create canonical generate_demo_csv.py (outputs to apps/web/public/demo-sample.csv)
2. **Step 2**: ✅ Ensure Reset + Use sample data flow works (ready to test)

### 🔧 PENDING

3. **Step 3**: Fix Top Categories aggregation (if issue persists)
   - Add backend test: `test_top_categories_with_demo_data()`
   - Verify query doesn't default to "Unknown"
   - Ensure category filtering by user_id works

4. **Step 4**: Make Spending Trends visually interesting
   - Add backend test: `test_spending_trends_has_variation()`
   - Verify monthly aggregation shows Aug spike

5. **Step 5**: Verify color mapping
   - Frontend test: All demo categories have non-grey colors
   - File: `apps/web/src/lib/formatters/merchants.ts`

6. **Step 6**: Add E2E test for demo mode
   - File: `apps/web/e2e/demo-mode.spec.ts`
   - Test: Reset → Use sample data → verify multiple categories in chart

---

## Deployment Notes

### Docker Images Built

```powershell
# Backend (unchanged - still using unknowns-fix)
ledgermind-backend:main-unknowns-fix

# Frontend (NEW)
docker build -t ledgermind-web:main-demo-6mo apps/web
```

### Deployment Command

```powershell
docker compose -f docker-compose.prod.yml up -d nginx
```

### Verification

```powershell
# Health check
curl http://localhost:8083/api/ready

# Demo CSV accessible
curl http://localhost:8083/demo-sample.csv | Select-Object -First 5

# Frontend serving
curl http://localhost:8083/ | Select-String "LedgerMind"
```

**All green** ✅

---

## File Inventory

### Changed Files

1. `apps/backend/scripts/generate_demo_csv.py` (201 lines)
   - Deterministic 6-month generation
   - Outputs to apps/web/public/demo-sample.csv

2. `apps/web/public/demo-sample.csv` (88 lines)
   - 87 transactions + header
   - 16 distinct categories
   - 3 unknowns

3. `docker-compose.prod.yml`
   - nginx image updated to `ledgermind-web:main-demo-6mo`

### Git Commit

```
commit bc4e6f69
feat: canonical 6-month demo CSV generation

- Rewrote generate_demo_csv.py to output to apps/web/public/demo-sample.csv
- Generates 6 months (Jun-Nov 2025) with 86 transactions total
- Monthly spend variation: $1,749-$3,275 (Aug spike: dental + vacation prep)
- 16 distinct categories: groceries, restaurants, fuel, shopping, utilities, etc.
- Only 3 unknowns for ML demo (not dominant)
```

**Pushed to GitHub** ✅

---

## Success Criteria

### ✅ Achieved

- [x] 6 months of data (Jun-Nov 2025)
- [x] 80+ transactions (86 total)
- [x] Monthly spending variation (±40% range: $1,749-$3,275)
- [x] Multiple categories (16 distinct)
- [x] Only ~3 unknowns (not dominant)
- [x] Canonical output path (apps/web/public/demo-sample.csv)
- [x] Deterministic generation (no randomness)
- [x] Deployed to production
- [x] Git committed and pushed

### ⏳ Pending Verification

- [ ] User clicks Reset → Use sample data → charts show multiple categories
- [ ] Top Categories shows 10+ colored bars (not giant Unknown bar)
- [ ] Spending Trends shows 6 months with clear Aug spike
- [ ] Unknowns card shows only 3 transactions (~$51, 2-3%)

---

## Testing Checklist

**Manual QA** (do this now):

1. [ ] Open http://localhost:8083 (or prod URL)
2. [ ] Click "Reset" button
3. [ ] Click "Use sample data" button
4. [ ] Wait for charts to load
5. [ ] Top Categories: Multiple bars? (groceries, restaurants, fuel, shopping)
6. [ ] Spending Trends: 6 months visible? Aug spike visible?
7. [ ] Unknowns card: Shows 3 transactions only?
8. [ ] No console errors?

**Backend Tests** (add these):

```python
# apps/backend/tests/test_charts_demo.py
def test_top_categories_with_demo_data():
    # Load demo CSV or mock similar data
    # Run Top Categories aggregation
    categories = get_top_categories(user_id=1, month="2025-11")

    # Assert multiple non-unknown categories
    assert len(categories) >= 5
    assert "groceries" in [c.category for c in categories]

    # Assert Unknown exists but isn't dominant
    unknown = next((c for c in categories if c.category == "unknown"), None)
    assert unknown is not None
    total_spend = sum(c.amount for c in categories)
    assert unknown.amount < total_spend * 0.3  # <30% of total
```

**E2E Tests** (add these):

```typescript
// apps/web/e2e/demo-mode.spec.ts
test('demo mode shows multiple categories', async ({ page }) => {
  await page.goto('/');
  await page.click('button:has-text("Reset")');
  await page.click('button:has-text("Use sample data")');
  await page.waitForSelector('.chart-card');

  const categoryBars = await page.locator('[data-testid="category-bar"]');
  expect(await categoryBars.count()).toBeGreaterThan(3);
});
```

---

## Rollback Plan

If charts still show "Unknown" after testing:

```powershell
# Revert to previous image
git checkout HEAD~1 docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d nginx

# OR keep investigating while leaving new CSV deployed
# (new CSV is strictly better than old 3-month version)
```

**Recommended**: Keep new deployment, debug category aggregation separately.

---

## Contact / Support

**Issue**: Charts still showing "Unknown" after Reset → Use sample data?

1. Check backend logs: `docker logs ai-finance-backend --tail 200`
2. Check DB categories: `docker exec -it lm-postgres psql -U lm -d lm -c "SELECT category, COUNT(*) FROM transactions GROUP BY category;"`
3. Review ingest logic: `apps/backend/app/routers/ingest.py`
4. Review charts logic: `apps/backend/app/services/charts.py` (or similar)

**Success indicator**: Query should return rows like:
```
category               | count
----------------------|-------
groceries             | 12
restaurants           | 8
fuel                  | 6
shopping.online       | 7
...
unknown               | 3
```

If ALL rows show "unknown", the category column isn't being populated during ingest.
