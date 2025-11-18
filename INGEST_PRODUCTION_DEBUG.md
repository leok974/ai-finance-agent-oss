# Production /ingest Debugging Guide

## Current Status

**Test Environment**: ✅ PASSING
- Backend test `test_ingest_nov2025_export` passes with `TEST_FAKE_AUTH=1`
- CSV parsing verified working correctly
- Response contract validated: `ok: true, added: 14, detected_month: "2025-11"`
- Database insertion confirmed: 14 transactions with `month="2025-11"`

**Production Environment**: ❌ UNKNOWN (needs verification)
- Manual UI upload shows: `{ok: true, added: 0, count: 0}`
- E2E test gets HTTP 500 error
- Root cause unclear: auth issue vs CSV format vs infrastructure

## Known Working Test Contract

The backend test establishes this EXACT contract that production should honor:

```python
# HTTP Response
assert response.status_code == 200
data = response.json()

# Response structure
assert data["ok"] is True
assert data["added"] > 0
assert data["count"] == data["added"]

# Month detection
assert data["detected_month"] == "2025-11"

# Date range validation
assert data["date_range"]["earliest"] <= data["date_range"]["latest"]
assert data["date_range"]["earliest"] == "2025-11-01"

# Database verification
txn_count = db.query(Transaction).count()
assert txn_count == data["added"]
assert all(txn.month == "2025-11" for txn in txns)
```

**Any deviation from this contract in production indicates env/auth/infra issues, NOT CSV parsing bugs.**

---

## Production Debugging Steps

### Step 1: Check Production Logs (Enhanced Logging Deployed)

New logging added to `/ingest` endpoint captures both success and failure cases.

**Check backend logs:**
```bash
# From ops/ directory
docker compose -f docker-compose.prod.yml logs backend --tail=500 --since=24h | Select-String "ingest"

# Look for these patterns:
# SUCCESS: "CSV ingest SUCCESS: user_id=X, added=Y, detected_month=..."
# FAILURE: "CSV ingest failed" (includes exception traceback)
# WARNING: "CSV ingest: N rows in file but 0 transactions added"
# WARNING: "CSV ingest: empty file or headers only"
```

**Expected success log format:**
```
INFO: CSV ingest SUCCESS: user_id=123, added=14, detected_month=2025-11, 
      date_range=2025-11-01 to 2025-11-30, replace=True, flip_auto=True, 
      total_rows_in_file=14, filename=export_nov2025.csv
```

**Compare with test behavior:**
- Test shows `added=14`, prod shows `added=0` → smoking gun for prod-specific issue
- Same user_id in logs? → verify auth is working
- Same total_rows_in_file? → verify CSV upload is complete
- Exception in logs? → reveals actual error (not just 500 generic)

---

### Step 2: Capture Frontend Response (Temporary Debug Logging)

Add temporary console.log in `UploadCsv.tsx` to see EXACT prod response:

```typescript
// In apps/web/src/components/UploadCsv.tsx
const handleUpload = async () => {
  // ... existing code ...
  
  const response = await fetchJSON<IngestResponse>(`ingest?replace=${replace}`, {
    method: 'POST',
    body: formData,
  });
  
  // 🔍 TEMPORARY DEBUG LOGGING
  console.log('🐛 PROD INGEST RESPONSE:', JSON.stringify(response, null, 2));
  
  // ... rest of handler ...
};
```

**What to check:**
1. Does `response.ok === true` or `false`?
2. What is `response.added` value? (0 vs 14)
3. Is `response.detected_month` present? (`"2025-11"` vs `null`)
4. Is `response.date_range` populated?
5. Any `error` or `message` fields?

**Comparison matrix:**

| Behavior | Test (Working) | Prod Symptom | Likely Cause |
|----------|----------------|--------------|--------------|
| HTTP status | 200 OK | 500 Error | Backend exception (check logs) |
| `ok` field | `true` | `false` | Empty CSV or parsing failure |
| `added` field | 14 | 0 | CSV format mismatch OR wrong user_id scope |
| `detected_month` | `"2025-11"` | `null` | No valid dates parsed |
| `date_range` | `{earliest, latest}` | `null` | No transactions added |

---

### Step 3: Verify Production Environment Variables

**Auth-related:**
```bash
# Check if TEST_FAKE_AUTH is accidentally set in prod
docker compose -f ops/docker-compose.prod.yml exec backend printenv | grep TEST_FAKE_AUTH
# Expected: (empty - should NOT be set)

# Check user isolation is working
docker compose -f ops/docker-compose.prod.yml exec backend printenv | grep -E "AUTH|SESSION|COOKIE"
```

**Database connection:**
```bash
# Verify backend is connected to correct Postgres instance
docker compose -f ops/docker-compose.prod.yml exec backend printenv | grep DATABASE_URL
```

---

### Step 4: Test Production /ingest Endpoint Directly (cURL)

Bypass frontend to isolate issue:

```bash
# 1. Get production session cookie (from browser DevTools → Application → Cookies)
PROD_COOKIE="access_token=eyJ..."

# 2. Upload test CSV directly
curl -X POST "https://app.ledger-mind.org/ingest?replace=true" \
  -H "Cookie: $PROD_COOKIE" \
  -F "file=@apps/backend/tests/fixtures/export_nov2025.csv" \
  -v

# Check response:
# - Status code: 200 vs 401 vs 500
# - Response body: {ok, added, detected_month, ...}
```

**If cURL works but UI doesn't:**
- Frontend path issue (check `VITE_API_BASE`)
- CORS misconfiguration
- Frontend cookie handling bug

**If cURL also fails:**
- Backend issue (check logs from Step 1)
- Auth middleware blocking request
- Nginx reverse proxy issue

---

### Step 5: Compare CSV Files (Test vs Prod Upload)

Ensure production is uploading the EXACT same format as test fixture:

```bash
# 1. Check test fixture format
head -20 apps/backend/tests/fixtures/export_nov2025.csv

# Expected headers (case-insensitive, order doesn't matter):
# date,amount,merchant,description,account,category

# 2. Download CSV from production upload (if possible)
# - Use browser DevTools → Network → Payload to see uploaded file
# - Or add logging: logger.info(f"CSV first 3 rows: {rows[:3]}")

# 3. Compare:
# - Header names (exact match? extra columns?)
# - Date format (2025-11-01 vs 11/01/2025?)
# - Amount format (decimal point vs comma?)
# - Encoding (UTF-8 vs Windows-1252?)
```

---

### Step 6: Verify User Scoping (Multi-Tenancy)

If `added=0` but logs show "rows parsed", check user isolation:

```bash
# Connect to production DB
docker compose -f ops/docker-compose.prod.yml exec postgres psql -U ledgermind

# Check if transactions exist but for DIFFERENT user_id
SELECT user_id, COUNT(*) FROM transactions 
WHERE month = '2025-11' 
GROUP BY user_id;

# If rows exist for user_id != your prod user:
# → Auth is passing wrong user_id (session issue)
# → Check auth middleware logs
```

---

## Next Steps After Production Investigation

### If Production Shows `added=0` But Test Shows `added=14`:

**Root Cause Candidates** (in order of likelihood):

1. **Auth Issue**: 
   - Production user_id doesn't match session user
   - Check: `logger.info(f"Ingest user_id={user_id}")` at start of `_ingest_csv_impl`
   - Fix: Verify `get_current_user_id()` returns correct user in prod

2. **CSV Format Mismatch**:
   - Production CSV has different headers/encoding
   - Check: Log first 3 rows with `logger.info(f"CSV rows sample: {rows[:3]}")`
   - Fix: Add CSV format validation or auto-header-mapping

3. **Database Connection**:
   - Transactions inserted to wrong DB or table
   - Check: Query production DB directly after upload
   - Fix: Verify `DATABASE_URL` points to correct instance

4. **Nginx Path Rewrite**:
   - Request not reaching backend `/ingest` endpoint
   - Check: Nginx access logs for POST /ingest requests
   - Fix: Verify nginx.conf `/ingest` location block

### If Production Shows HTTP 500:

**Already added exception logging**, so check logs for:
- Exception type (KeyError, ValueError, SQLAlchemyError, etc.)
- Full traceback (line number where it failed)
- User context (user_id, filename, replace flag)

**Common 500 causes:**
1. Missing DB column (month field not in schema)
2. File encoding issue (non-UTF-8 upload)
3. DB constraint violation (duplicate key, foreign key)
4. Missing dependency override (TEST_FAKE_AUTH logic not activated)

---

## E2E Test Enhancement (After Fix)

Once production `/ingest` is confirmed working, update E2E test:

**File**: `apps/web/tests/e2e/csv-ingest-populates-dashboard.spec.ts`

**Add these assertions:**
```typescript
// After successful CSV upload
await expect(page.getByTestId('upload-success-toast')).toBeVisible();

// Wait for dashboard to refresh
await page.waitForTimeout(2000);

// Verify non-zero values
await expect(page.getByTestId('expanded-insights-income')).not.toHaveText('$0.00');
await expect(page.getByTestId('expanded-insights-spend')).not.toHaveText('$0.00');

// Verify charts populated
await expect(page.getByTestId('top-categories-list').locator('li')).toHaveCount(greaterThan(0));
await expect(page.getByTestId('top-merchants-list').locator('li')).toHaveCount(greaterThan(0));

// Verify correct month shown
await expect(page.getByTestId('month-selector')).toHaveText('November 2025');
```

---

## Reference Files

**Backend:**
- Ingest endpoint: `apps/backend/app/routers/ingest.py`
- Test suite: `apps/backend/tests/test_ingest_nov2025.py`
- Test fixture: `apps/backend/tests/fixtures/export_nov2025.csv`
- Auth guard: `apps/backend/app/deps/auth_guard.py`
- Test config: `apps/backend/tests/conftest.py` (fake_auth_env fixture)

**Frontend:**
- Upload component: `apps/web/src/components/UploadCsv.tsx`
- HTTP client: `apps/web/src/lib/http.ts` (fetchJSON helper)
- E2E test: `apps/web/tests/e2e/csv-ingest-populates-dashboard.spec.ts`

**Infrastructure:**
- Nginx config: `ops/nginx/conf.d/*.conf`
- Docker Compose: `ops/docker-compose.prod.yml`
- Production logs: `docker compose logs backend --tail=500 --since=24h`

---

## Dividing Line: Test vs Prod

**What We Know (From Passing Test):**
✅ CSV parsing logic is correct
✅ Duplicate detection works
✅ Month detection works
✅ Date range calculation works
✅ Database insertion works
✅ Response contract is correct

**What We DON'T Know (Production Mystery):**
❓ Does production return HTTP 200 or 500?
❓ Does production return `ok: true` or `ok: false`?
❓ Does production return `added > 0` or `added: 0`?
❓ Does production populate `detected_month`?
❓ Does production actually insert to database?

**The Fix Path:**
1. Check production logs (Step 1) → reveals exception OR success with added=0
2. If exception → fix root cause (DB, auth, CSV encoding)
3. If success but added=0 → compare CSV format, user_id, DB query
4. If HTTP 500 → check exception traceback in logs
5. Once fixed → remove debug logging, update E2E test assertions

**Expected Timeline:**
- Step 1 (logs): 5 minutes
- Step 2 (frontend debug): 10 minutes
- Step 3-6 (investigation): 30-60 minutes depending on findings
- Fix implementation: varies by root cause
- E2E test update: 15 minutes
