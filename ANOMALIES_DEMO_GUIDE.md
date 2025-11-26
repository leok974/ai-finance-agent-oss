# Anomalies Demo Guide

## Overview

The **Anomalies card** (`InsightsAnomaliesCard.tsx`) shows category spending anomalies detected by analyzing historical spending patterns. This guide explains how anomaly detection works and how to verify it displays correctly with demo data.

---

## How Anomaly Detection Works

### Backend Logic (`apps/backend/app/services/insights_anomalies.py`)

**Algorithm:**
1. **Historical Window**: Compares current month against prior N months (default: 6 months)
2. **Median Calculation**: Computes median spending for each category across historical months
3. **Deviation**: Calculates `(current - median) / median` percentage change
4. **Thresholds**: Flags categories exceeding:
   - **Percentage threshold**: 40% deviation (configurable via `threshold_pct`)
   - **Minimum amount**: $50 current month spending (configurable via `min_spend_current`)

**Important Filters:**
```python
# Only categorized transactions are included
.filter(
    Transaction.category.isnot(None),      # Exclude None
    Transaction.category != "",            # Exclude empty
    Transaction.category != "Unknown",     # Exclude "Unknown" string
    Transaction.amount < 0,                 # Expenses only (negative amounts)
)
```

**This means:**
- ✅ **Categorized transactions** (e.g., `shopping.retail`, `groceries`) → **CAN trigger anomalies**
- ❌ **Uncategorized transactions** (`category=None`) → **CANNOT trigger anomalies**
- ❌ **Income** (positive amounts) → **EXCLUDED from anomaly detection**

---

## Demo Data Anomaly Triggers

### Demo Dataset: `apps/web/public/demo-sample.csv`

**Expected Anomaly: `shopping.retail` in November 2025**

| Month | Shopping.Retail Spend | Notes |
|-------|----------------------|-------|
| Jun 2025 | $89.34 | Baseline |
| Jul 2025 | $115.34 | Low |
| Aug 2025 | $431.33 | Normal |
| Sep 2025 | $323.68 | Normal |
| Oct 2025 | $372.24 | Normal |
| **Nov 2025** | **$1,119.33** | **🚨 SPIKE!** |

**Calculation:**
```
Historical months: [89.34, 115.34, 323.68, 372.24, 431.33]
Median: $323.68
Current (Nov 2025): $1,119.33
Deviation: (1119.33 - 323.68) / 323.68 = +245.8%
```

**Result:** ✅ **TRIGGERS ANOMALY** (245.8% > 40% threshold)

**Key Transaction:**
```csv
2025-11-24,BEST BUY BLACK FRIDAY,TV upgrade,-899.99,shopping.retail
```

### Unknown Category Behavior

**Demo Dataset Contains:**
- 17 unusual transactions marked as `"unknown"` category
- Examples: Late-night ATMs, duplicate charges, offshore merchants

**Normalization:**
```python
normalize_category("unknown") → None  # Maps to uncategorized
```

**Result:**
- ❌ **Will NOT appear in Anomalies card** (filtered out by `category.isnot(None)`)
- ✅ **Will appear in Uncategorized panel** (correctly shows unknowns)

---

## Verification Steps

### Step 1: Seed Demo Data

**Endpoint:**
```bash
POST /demo/seed
```

**Expected Response:**
```json
{
  "ok": true,
  "transactions_cleared": 0,
  "transactions_added": 170,
  "months_seeded": ["2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11"],
  "txns_count": 170,
  "message": "Demo data reset successfully..."
}
```

**Via Frontend:**
1. Open LedgerMind app
2. Navigate to "Demo Mode" or similar
3. Click "Seed Demo Data" button
4. Wait for success message

### Step 2: Navigate to Current Month (November 2025)

The anomaly detection defaults to the **latest month in the database**. Since demo data goes through November 2025, that's the target month.

### Step 3: Check Anomalies Card

**Expected Display:**

```
⚠ Unusual this month

We found some unusual activity this month based on your historical spending.

┌─────────────────────────────────────────────┐
│ Anomalies — Categories                      │
├─────────────────────────────────────────────┤
│ [High] shopping.retail                      │
│ $1,119.33 vs $323.68 median                 │
│ +245.8%                                     │
└─────────────────────────────────────────────┘
```

**If Empty State Shows:**
```
No unusual categories or alerts this month. 🎉
```

**Possible Causes:**
1. ❌ Demo data not seeded
2. ❌ Wrong month selected (default should be Nov 2025)
3. ❌ Database has different data
4. ❌ Thresholds too strict (unlikely - 245% is massive)

### Step 4: Verify API Response Directly

**API Endpoint:**
```
GET /insights/anomalies?months=6&min_spend_current=50&threshold_pct=0.4&max_results=8&month=2025-11
```

**Expected Response:**
```json
{
  "month": "2025-11",
  "anomalies": [
    {
      "category": "shopping.retail",
      "current": 1119.33,
      "median": 323.68,
      "pct_from_median": 2.458,
      "sample_size": 5,
      "direction": "high"
    }
  ]
}
```

**Test Command (PowerShell):**
```powershell
$headers = @{ "Cookie" = "your-session-cookie" }
Invoke-RestMethod -Uri "http://localhost:5173/insights/anomalies?month=2025-11" -Headers $headers | ConvertTo-Json -Depth 3
```

---

## Frontend Implementation

### Component: `InsightsAnomaliesCard.tsx`

**API Call:**
```typescript
const res = await getAnomalies({
  months: 6,        // Historical window
  min: 50,          // $50 minimum current spend
  threshold: 0.4,   // 40% deviation threshold
  max: 6,           // Max results to return
  month: selectedMonth  // Override month (optional)
})
```

**Display Logic:**
```typescript
const hasCategoryAnomalies = data.length > 0
const hasAlerts = alerts?.alerts && alerts.alerts.length > 0
const hasAnyUnusual = hasCategoryAnomalies || hasAlerts

// Shows banner if anomalies OR alerts exist
{hasAnyUnusual && <p className="text-amber-600">⚠ Unusual this month</p>}

// Shows category anomalies section
{hasCategoryAnomalies && (
  <section>
    <h4>Anomalies — Categories</h4>
    {data.map(anomaly => <AnomalyItem {...anomaly} />)}
  </section>
)}

// Shows empty state only if NO anomalies AND NO alerts
{!hasAnyUnusual && <p>No unusual categories or alerts this month. 🎉</p>}
```

---

## Merchant Anomalies (Future Enhancement)

**Current State:** ❌ **Not Implemented**

The component currently only shows **category anomalies**. Merchant-level anomaly detection would require:

1. **Backend Enhancement:**
   ```python
   def compute_merchant_anomalies(
       db: Session,
       user_id: int,
       months: int = 6,
       min_spend_current: float = 50.0,
       threshold_pct: float = 0.4,
       max_results: int = 8,
       target_month: str | None = None,
   ) -> dict:
       # Similar logic to category anomalies, but grouped by merchant
       pass
   ```

2. **Frontend API Call:**
   ```typescript
   const merchantAnomalies = await getMerchantAnomalies({ month })
   ```

3. **UI Section:**
   ```typescript
   {hasMerchantAnomalies && (
     <section>
       <h4>Anomalies — Merchants</h4>
       {merchantData.map(m => <MerchantAnomalyItem {...m} />)}
     </section>
   )}
   ```

**User Request:** The user mentioned wanting both "Anomalies — Categories" and "Anomalies — Merchants" tables. Currently only categories are supported.

---

## Troubleshooting

### Problem: "No unusual categories" despite demo data

**Diagnostic Checklist:**

1. **Verify demo data seeded:**
   ```sql
   SELECT COUNT(*) FROM transactions WHERE is_demo = true;
   -- Expected: 170
   ```

2. **Check category distribution:**
   ```sql
   SELECT category, COUNT(*), SUM(ABS(amount))
   FROM transactions
   WHERE is_demo = true AND month = '2025-11'
   GROUP BY category
   ORDER BY SUM(ABS(amount)) DESC;
   ```
   Expected: `shopping.retail` should show ~$1,119

3. **Verify category normalization:**
   ```python
   from app.core.category_mappings import normalize_category
   assert normalize_category("shopping.retail") == "shopping.retail"
   assert normalize_category("unknown") is None
   ```

4. **Check API response:**
   ```bash
   curl 'http://localhost:5173/insights/anomalies?month=2025-11' \
     -H 'Cookie: your-session-cookie'
   ```

5. **Verify thresholds:**
   - Default: 40% threshold, $50 minimum
   - Demo spike: 245.8% (should easily pass)

### Problem: Empty state shows intermittently

**Possible Causes:**
- **Month selector**: Ensure November 2025 is selected
- **Data cleared**: Demo data may have been deleted
- **Wrong user**: Ensure logged in as user who seeded data

### Problem: TypeError or undefined errors

**Check:**
- API response structure matches expected types
- `data.length` is safe (data might be `undefined`)
- Guards: `data?.length > 0` instead of `data.length > 0`

---

## Summary

✅ **What Works:**
- Category anomaly detection for categorized transactions
- Demo data with 245% `shopping.retail` spike in November 2025
- Uncategorized panel for "unknown" transactions

⏸️ **Not Implemented:**
- Merchant-level anomaly detection
- Merchant anomalies display section

🎯 **To Verify Demo Works:**
1. Seed demo data (`POST /demo/seed`)
2. Navigate to November 2025
3. Anomalies card should show `shopping.retail` high anomaly (+245.8%)
4. Uncategorized panel should show 17 unknown transactions
