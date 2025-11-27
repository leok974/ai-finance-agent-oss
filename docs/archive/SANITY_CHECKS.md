# Production Sanity Checks for Data Visibility Issues

Run these checks on your production environment to diagnose month mismatch and data visibility issues.

## Prerequisites

- SSH/exec access to production containers
- curl or Invoke-RestMethod for API testing
- Valid authentication cookie/session

## Check 1: Verify DB has rows with correct month values

Check if transactions have the `month` column populated correctly:

```powershell
# Production (docker compose)
docker compose -f docker-compose.prod.yml exec postgres psql -U myuser -d finance -c "
  SELECT month, COUNT(*) AS n, MIN(date) AS min_d, MAX(date) AS max_d
  FROM transactions GROUP BY month ORDER BY month DESC;"
```

**Expected Output:**
```
   month   |  n  |   min_d    |   max_d
-----------+-----+------------+------------
 2025-08   | 150 | 2025-08-01 | 2025-08-31
 2025-07   | 145 | 2025-07-01 | 2025-07-30
```

**If 2025-08 is missing or has 0 rows:**
- The ingest didn't persist the `month` field
- Run the backfill query below

**Backfill Query (one-time fix):**
```sql
UPDATE transactions
SET month = TO_CHAR(date, 'YYYY-MM')
WHERE month IS NULL;
```

---

## Check 2: Does charts tool see the data for Aug 2025?

Test the backend API directly to verify it can query data for the month:

```powershell
$body = @{ month = "2025-08"; include_daily = $true } | ConvertTo-Json

# Using production URL
Invoke-RestMethod -Method POST https://app.ledger-mind.org/agent/tools/charts/summary `
  -ContentType "application/json" `
  -Body $body `
  -SessionVariable session
```

**Expected Output:**
```json
{
  "month": "2025-08",
  "expenses": -2456.78,
  "income": 5000.00,
  "net": 2543.22,
  "daily": [...]
}
```

**If expenses/income are zero:**
- Month filter mismatch (UI sending different month than expected)
- Account filter is active and filtering out all transactions
- Check the `account` column in transactions table

---

## Check 3: Test suggestions endpoint

Verify suggestions API returns data for the month:

```powershell
$body = @{ month = "2025-08"; window_months = 3; min_support = 3; min_share = 0.6; limit = 10 } | ConvertTo-Json

Invoke-RestMethod -Method POST https://app.ledger-mind.org/agent/tools/suggestions `
  -ContentType "application/json" `
  -Body $body `
  -WebSession $session
```

**Expected Output:**
```json
{
  "items": [
    {
      "merchant": "AMAZON",
      "suggest_category": "shopping.online",
      "confidence": 0.85,
      "support": 12
    }
  ],
  "meta": {
    "reason": null
  }
}
```

**If meta.reason = "no_data_for_month":**
- Month mismatch (UI context month ≠ API call month)
- No uncategorized transactions for that month
- Check the `category` and `raw_category` columns

**If meta.reason = "month_missing":**
- UI didn't pass a month parameter
- Frontend month context is undefined
- Check browser console for month picker state

---

## Check 4: Account Filter Check

If charts show empty but tables show data, check if account filter is active:

```powershell
# List all distinct accounts in transactions
docker compose -f docker-compose.prod.yml exec postgres psql -U myuser -d finance -c "
  SELECT DISTINCT account, COUNT(*) as n
  FROM transactions WHERE month = '2025-08'
  GROUP BY account ORDER BY n DESC;"
```

**Expected Output:**
```
  account   |  n
------------+-----
 Checking   | 120
 Credit     |  30
 (null)     |  0
```

**If there are accounts:**
- Check UI "Account" chip filter (top of dashboard)
- Set to "All" to see all transactions regardless of account

---

## Check 5: Verify environment variables

Check if frontend has correct feature flags:

```powershell
# In browser console (F12):
console.log({
  VITE_API_BASE: import.meta.env.VITE_API_BASE,
  VITE_SUGGESTIONS_ENABLED: import.meta.env.VITE_SUGGESTIONS_ENABLED,
  VITE_DEV_UI: import.meta.env.VITE_DEV_UI
})
```

**Expected:**
- `VITE_API_BASE`: Should be `/` or empty (relative paths)
- `VITE_SUGGESTIONS_ENABLED`: Should be `'1'` if you want suggestions panel
- `VITE_DEV_UI`: Optional, `'1'` for dev features

---

## Check 6: Test upload detection

Upload a test CSV and verify the response includes `detected_month`:

```powershell
# Create test CSV with August data
@"
date,amount,merchant,description,account
2025-08-15,-25.50,AMAZON,Test purchase,Checking
2025-08-20,-12.99,SPOTIFY,Monthly subscription,Credit
"@ | Out-File -FilePath test_august.csv -Encoding utf8

# Upload and check response
$form = @{
  file = Get-Item test_august.csv
  replace = $false
}

$response = Invoke-RestMethod -Method POST https://app.ledger-mind.org/ingest `
  -Form $form `
  -WebSession $session

# Should include detected_month
$response | ConvertTo-Json
```

**Expected Output:**
```json
{
  "ok": true,
  "added": 2,
  "count": 2,
  "flip_auto": false,
  "detected_month": "2025-08",
  "date_range": {
    "earliest": "2025-08-15",
    "latest": "2025-08-20"
  }
}
```

**If `detected_month` is missing:**
- Old backend code (rebuild needed)
- No valid dates parsed from CSV

---

## Troubleshooting Flowchart

```
Data uploaded but dashboard shows "No data"?
├─ Check 1: DB has month='2025-08'?
│  ├─ NO → Run backfill query
│  └─ YES → Continue
│
├─ Check 2: Charts API returns data?
│  ├─ NO → Month or account filter mismatch
│  └─ YES → Continue
│
├─ Check 3: Suggestions API returns data?
│  ├─ meta.reason = "no_data_for_month"
│  │  └─ All transactions already categorized
│  ├─ meta.reason = "month_missing"
│  │  └─ UI month context not set
│  └─ items = [] but no meta.reason
│     └─ No qualifying suggestions (all merchants categorized)
│
└─ Check 4: Account filter active?
   ├─ YES → Set to "All"
   └─ NO → Check browser console for errors
```

---

## Quick Fixes

### Fix 1: Backfill month column
```sql
UPDATE transactions
SET month = TO_CHAR(date, 'YYYY-MM')
WHERE month IS NULL;
```

### Fix 2: Reset account filter
In browser console:
```javascript
localStorage.removeItem('selected_account');
window.location.reload();
```

### Fix 3: Force month refresh
In browser console:
```javascript
// Get latest month from backend
fetch('/api/latest_month')
  .then(r => r.json())
  .then(d => {
    localStorage.setItem('month', d.month);
    window.location.reload();
  });
```

### Fix 4: Clear all filters and caches
```javascript
// Reset UI state
['selected_account', 'month', 'filters'].forEach(k => localStorage.removeItem(k));
// Clear any service worker caches
navigator.serviceWorker?.getRegistrations().then(regs =>
  regs.forEach(reg => reg.unregister())
);
window.location.reload();
```

---

## Contact Developer

If none of these checks reveal the issue, collect:
1. Output from all 6 checks above
2. Browser console logs (F12 → Console → Export)
3. Network tab HAR export (F12 → Network → Export HAR)
4. Backend container logs: `docker compose -f docker-compose.prod.yml logs backend --tail 100`

These will help diagnose deeper architectural issues.
