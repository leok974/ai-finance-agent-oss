# CSV Ingest Architecture

## Overview

LedgerMind supports importing financial transactions from various CSV formats. The system automatically detects the CSV schema, normalizes headers, parses rows, and handles duplicates gracefully.

## Supported CSV Formats

The backend supports four CSV schemas with flexible header matching:

### 1. LedgerMind CSV (Native Format)

**Required Columns:**

- `date` - Transaction date (YYYY-MM-DD or MM/DD/YYYY)
- `merchant` - Merchant/vendor name
- `description` - Transaction description
- `amount` - Transaction amount (positive for income, negative for expenses)

**Optional Columns:**

- `category` - Transaction category
- `memo` - Additional notes
- `account` - Account identifier

**Description:** The native LedgerMind export format, designed for round-trip exports and imports.

**Example:**

```csv
date,merchant,description,amount,category,account
2025-11-15,Amazon,Office supplies,-42.99,Supplies,Chase Checking
2025-11-14,Acme Corp,Consulting income,1500.00,Income,Business Account
```

### 2. Bank Export v1

**Required Columns:**

- `date` - Transaction date
- `description` - Transaction description
- `comments` - Additional transaction notes
- `check number` - Check number (if applicable)
- `amount` - Transaction amount
- `balance` - Account balance after transaction

**Description:** Common format used by many US banks for checking account exports.

**Example:**

```csv
Date,Description,Comments,Check Number,Amount,Balance
11/15/2025,AMAZON.COM,-,,42.99,1542.33
11/14/2025,Direct Deposit,Payroll,,1500.00,1585.32
```

### 3. Bank Debit/Credit

**Required Columns:**

- `date` - Transaction date
- `description` - Transaction description
- `debit` - Debit amount (money out)
- `credit` - Credit amount (money in)
- `balance` - Account balance after transaction

**Description:** Format that separates debits and credits into distinct columns.

**Example:**

```csv
Date,Description,Debit,Credit,Balance
11/15/2025,AMAZON.COM,42.99,,1542.33
11/14/2025,Direct Deposit,,1500.00,1585.32
```

### 4. Bank Posted/Effective Date

**Required Columns:**

- `posted date` - Date transaction posted to account
- `effective date` - Date transaction actually occurred
- `description` - Transaction description
- `amount` - Transaction amount
- `type` - Transaction type (e.g., "Debit", "Credit", "Fee")
- `balance` - Account balance after transaction

**Description:** Format used by banks that distinguish between posted and effective dates.

**Example:**

```csv
Posted Date,Effective Date,Description,Amount,Type,Balance
11/16/2025,11/15/2025,AMAZON.COM,-42.99,Debit,1542.33
11/15/2025,11/14/2025,Direct Deposit,1500.00,Credit,1585.32
```

## Parsing Behavior & Error Codes

### Header Detection

**Normalization Rules:**

1. **Case-insensitive:** `Date`, `DATE`, and `date` are all equivalent
2. **Whitespace & punctuation relaxed:** `Posted Date`, `posted_date`, and `PostedDate` match
3. **Schema matching:** Parser tries each schema in order, uses first match

**Process:**

1. Read first row of CSV
2. Normalize each header (lowercase, remove punctuation/spaces)
3. Try to match against each schema's required columns
4. If match found, use that schema for parsing
5. If no match, return `unknown_format` error

### Unknown Format Error

**Error Code:** `unknown_format`

**Triggered When:** CSV headers don't match any supported schema

**Response Structure:**

```json
{
  "ok": false,
  "added": 0,
  "count": 0,
  "flip_auto": false,
  "detected_month": null,
  "date_range": null,
  "error": "unknown_format",
  "message": "CSV format not recognized. Please ensure your CSV has the required columns for one of the supported formats.",
  "headers_found": [
    "transaction_id",
    "posting_date",
    "desc",
    "amt",
    "running_balance"
  ]
}
```

**Key Fields:**

- `headers_found`: Array of normalized header names from the uploaded CSV
- Helps users understand what was detected and rename columns if needed

### Duplicate Handling

**Deduplication Key:** `[date, amount, description]`

**Database Constraint:** `uq_txn_dedup` on transactions table

**Behavior:**

- Duplicates are **skipped**, not rejected with 500 error
- Response includes count of duplicates
- Duplicates are counted separately from successfully added transactions

**Example Response:**

```json
{
  "ok": true,
  "added": 82,
  "count": 82,
  "flip_auto": true,
  "detected_month": "2025-11",
  "date_range": ["2025-11-01", "2025-11-30"],
  "duplicates": 1,
  "message": "Successfully imported 82 transactions. 1 duplicate was skipped."
}
```

**Duplicate Scenario Example:**

```csv
date,merchant,description,amount
2025-11-15,Amazon,Office supplies,-42.99
2025-11-15,Amazon,Office supplies,-42.99
```

Result: 1 transaction added, 1 duplicate skipped

### No Rows Parsed Error

**Error Code:** `no_rows_parsed`

**Triggered When:** CSV has rows but none can be successfully converted (e.g., all dates invalid, all amounts unparseable)

**Response Structure:**

```json
{
  "ok": false,
  "added": 0,
  "count": 0,
  "error": "no_rows_parsed",
  "message": "CSV contained rows but none could be parsed. Please check that dates and amounts are in the correct format."
}
```

**Common Causes:**

- Date format not recognized (e.g., European DD/MM/YYYY when expecting MM/DD/YYYY)
- Amount contains currency symbols or non-numeric characters
- Required columns contain null/empty values

## Backend Bug Fixes

### Issue: ingest_500_on_duplicate

**Root Cause:**

When uploading a CSV with duplicate transactions, the backend would:

1. Attempt to insert duplicate row
2. Hit `IntegrityError` on `uq_txn_dedup` constraint
3. Try to log error with `extra={"filename": csv_file.filename}`
4. Python's logging module raised `KeyError` because `"filename"` is a reserved LogRecord attribute
5. Original `IntegrityError` was masked by the logging error
6. User received 500 Internal Server Error instead of friendly duplicate message

**Fix:**

1. **Catch duplicate constraint violations:**

```python
except IntegrityError as e:
    if "uq_txn_dedup" in str(e):
        duplicate_count += 1
        continue  # Skip this row, don't raise 500
    else:
        raise  # Re-raise other integrity errors
```

2. **Return structured response with duplicates count:**

```python
return {
    "ok": True,
    "added": added_count,
    "duplicates": duplicate_count,
    "message": f"Successfully imported {added_count} transactions. {duplicate_count} duplicates were skipped."
}
```

3. **Fix logging to avoid reserved keys:**

```python
# Before (caused KeyError)
logger.error("Error", extra={"filename": csv_file.filename})

# After (uses safe key name)
logger.error("Error", extra={"csv_filename": csv_file.filename})
```

**Status:** Deployed to production

**Test Case:** `export_20251112.csv` now ingests cleanly with 82 transactions added, 1 duplicate skipped, and charts populate correctly.

## Frontend Result UI & JSON Toggle

### Components

- **UploadCsvCard:** Container for CSV upload form and results
- **CsvIngestResultCard:** Displays success/error states with friendly messages

### Success State

**Visual:** Green/emerald card with success icon

**Message Format:**

```
✓ Success! Imported 82 transactions for November 2025 (2025-11-01 to 2025-11-30).
1 duplicate was skipped.
```

**Components:**

- Added count
- Detected month (if available)
- Date range
- Duplicate count (if any)

**Styling:**

- Green border and background
- Large checkmark icon
- Readable typography with counts emphasized

### Error States

#### Unknown Format Error

**Message:**

```
✗ CSV format not recognized

We detected the following headers:
• transaction_id
• posting_date
• desc
• amt
• running_balance

Please ensure your CSV matches one of the supported formats. You may need to rename columns to match the expected names (e.g., "date", "amount", "description").
```

**Key Features:**

- Shows detected headers (`headers_found` array from response)
- Provides actionable guidance about renaming columns
- Links to supported formats documentation

#### No Rows Parsed Error

**Message:**

```
✗ No transactions could be parsed

The CSV file contained rows, but none could be successfully converted.

Common issues:
• Date format not recognized (try YYYY-MM-DD or MM/DD/YYYY)
• Amount contains non-numeric characters
• Required fields are empty

Please check your data and try again.
```

**Guidance:**

- Explains the likely causes
- Suggests specific fixes
- Encourages user to review data format

#### All Duplicates Scenario

**Message:**

```
✗ All transactions already exist

All 15 transactions in this CSV are duplicates of existing data.

If you want to re-import this data:
1. Use "Replace existing data" option (if available)
2. Or delete the existing transactions first
```

**Features:**

- Clearly states the issue
- Suggests alternative actions
- Prevents confusion about why nothing was imported

#### Generic Error Fallback

**Message:**

```
✗ Upload failed

An unexpected error occurred: [error message]

Please try again or contact support if the problem persists.
```

**Used When:** Unexpected error codes or network failures

### Raw JSON Toggle

**Purpose:** Allow power users and support staff to see the raw backend response

**UI Elements:**

- Checkbox: "Show raw JSON response"
- JSON block: Syntax-highlighted, prettified JSON

**Test IDs:**

| Element         | Test ID                  | Description              |
| --------------- | ------------------------ | ------------------------ |
| Toggle Checkbox | `csv-ingest-toggle-json` | Shows/hides JSON block   |
| JSON Display    | `csv-ingest-json`        | Prettified JSON response |
| Message Display | `csv-ingest-message`     | User-friendly message    |

**Behavior:**

```typescript
const [showJson, setShowJson] = useState(false);

return (
  <>
    <div data-testid="csv-ingest-message">{/* User-friendly message */}</div>

    <label>
      <input
        type="checkbox"
        data-testid="csv-ingest-toggle-json"
        checked={showJson}
        onChange={(e) => setShowJson(e.target.checked)}
      />
      Show raw JSON response
    </label>

    {showJson && (
      <pre data-testid="csv-ingest-json">
        {JSON.stringify(response, null, 2)}
      </pre>
    )}
  </>
);
```

## Tests

### Backend Tests

**Location:** `apps/backend/tests/test_ingest_current_csv_format.py`

**Fixture:** `apps/backend/tests/fixtures/export_nov2025.csv`

#### test_ingest_nov2025_export

**Purpose:** Verify parsing of realistic November 2025 export

**Setup:**

- Uses `TEST_FAKE_AUTH=1` via `fake_auth_env` fixture
- Loads `export_nov2025.csv` (14 transactions)
- Posts to `/api/ingest?replace=true`

**Assertions:**

```python
assert response.status_code == 200
data = response.json()
assert data["ok"] is True
assert data["added"] >= 10  # At least 10 transactions parsed
assert data["detected_month"] == "2025-11"
assert data["date_range"][0].startswith("2025-11")
assert data["date_range"][1].startswith("2025-11")
```

**Status:** ✅ Passing (3/3 tests)

#### unknown_format_test (Planned)

**Purpose:** Verify `unknown_format` error handling

**Test Case:**

```python
def test_unknown_format_returns_headers_found(client, fake_auth_env):
    # CSV with unrecognized headers
    csv_content = "transaction_id,posting_date,desc,amt\n1,2025-11-15,Test,42.99"

    response = client.post(
        "/api/ingest?replace=true",
        files={"file": ("unknown.csv", csv_content, "text/csv")}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["error"] == "unknown_format"
    assert "headers_found" in data
    assert "transaction_id" in data["headers_found"]
    assert "posting_date" in data["headers_found"]
```

**Status:** Planned/partial implementation

### Frontend Tests (Playwright, Prod Lane)

**Location:** `apps/web/tests/e2e/`

**Authentication:** Uses `/api/e2e/session` HMAC session minting (see `CHAT_E2E_STRATEGY.md`)

#### csv-ingest-populates-dashboard.spec.ts

**Purpose:** End-to-end validation that CSV upload populates dashboard

**Tags:** `@prod`

**Flow:**

1. Mint authenticated session via global-setup
2. Navigate to `/`
3. Upload realistic CSV via `/api/ingest?replace=true`
4. Assert response `ok: true`
5. Navigate to dashboard
6. Assert charts are populated (e.g., month_merchants, month_categories)
7. Assert insight cards show data

**Example:**

```typescript
test("@prod upload realistic CSV and verify dashboard", async ({ page }) => {
  const csvContent = `date,merchant,description,amount
2025-11-15,Amazon,Office supplies,-42.99
2025-11-14,Acme Corp,Consulting,1500.00`;

  const response = await page.request.post("/api/ingest?replace=true", {
    multipart: {
      file: {
        name: "transactions.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csvContent),
      },
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.ok).toBe(true);
  expect(data.added).toBeGreaterThan(0);

  // Verify dashboard populated
  await page.goto("/");
  await expect(page.locator('[data-viz="month_merchants"]')).toBeVisible();
});
```

**Status:** ✅ Implemented and running in prod E2E lane

#### csv-unknown-headers-ui.spec.ts (Planned)

**Purpose:** Verify UI shows friendly error for unrecognized CSV format

**Tags:** `@prod`, `@csv`

**Flow:**

1. Upload CSV with unknown headers (e.g., `error_unknown_headers.csv`)
2. Assert error message is displayed
3. Assert `headers_found` array is shown to user
4. Assert helpful guidance about renaming columns

**Example:**

```typescript
test("@prod @csv shows headers for unknown format", async ({ page }) => {
  await page.goto("/");

  const csvContent = `transaction_id,posting_date,desc,amt
1,2025-11-15,Test,42.99`;

  await page.locator('[data-testid="csv-upload-input"]').setInputFiles({
    name: "unknown.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent),
  });

  await page.locator('[data-testid="csv-upload-submit"]').click();

  // Assert error message
  await expect(
    page.locator('[data-testid="csv-ingest-message"]')
  ).toContainText("CSV format not recognized");

  // Assert headers are shown
  await expect(
    page.locator('[data-testid="csv-ingest-message"]')
  ).toContainText("transaction_id");
  await expect(
    page.locator('[data-testid="csv-ingest-message"]')
  ).toContainText("posting_date");
});
```

**Status:** Planned

#### csv-ingest-json-toggle.spec.ts (Planned)

**Purpose:** Verify JSON toggle shows/hides raw response

**Tags:** `@prod`, `@csv`

**Flow:**

1. Upload any CSV (success or error)
2. Assert `csv-ingest-toggle-json` checkbox is visible
3. Click toggle
4. Assert `csv-ingest-json` block appears with prettified JSON
5. Click toggle again
6. Assert JSON block is hidden

**Example:**

```typescript
test("@prod @csv JSON toggle works", async ({ page }) => {
  await page.goto("/");

  // Upload CSV
  const csvContent = `date,merchant,description,amount
2025-11-15,Amazon,Office supplies,-42.99`;

  await page.locator('[data-testid="csv-upload-input"]').setInputFiles({
    name: "test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvContent),
  });

  await page.locator('[data-testid="csv-upload-submit"]').click();

  // Toggle JSON on
  await page.locator('[data-testid="csv-ingest-toggle-json"]').check();
  await expect(page.locator('[data-testid="csv-ingest-json"]')).toBeVisible();

  const jsonText = await page
    .locator('[data-testid="csv-ingest-json"]')
    .textContent();
  const parsed = JSON.parse(jsonText);
  expect(parsed).toHaveProperty("ok");

  // Toggle JSON off
  await page.locator('[data-testid="csv-ingest-toggle-json"]').uncheck();
  await expect(
    page.locator('[data-testid="csv-ingest-json"]')
  ).not.toBeVisible();
});
```

**Status:** Planned

## Pending Transactions Toggle

**Design Note:** Conceptual implementation, code may still be partial.

### Feature Spec

**UI Element:** Toggle in dashboard header

**Label:** "Include pending in totals"

**Behavior:**

- When **enabled** (default):

  - Pending transactions are included in Income/Spend/Net calculations
  - All charts include pending transactions
  - Transactions table shows all transactions by default

- When **disabled**:
  - Pending transactions are excluded from Income/Spend/Net
  - Charts only show posted/cleared transactions
  - Transactions table adds "Pending" filter option

### Implementation Status

- ✅ Toggle UI component created
- ✅ State management in place
- ⏳ Chart filtering logic (partial)
- ⏳ Transactions table filter (partial)
- ❌ Backend API support for pending flag (not yet implemented)

### Future Work

1. Add `is_pending` boolean column to transactions table
2. Update CSV parsers to detect pending transactions (if possible)
3. Add backend filtering logic to `/api/summary` and chart endpoints
4. Complete frontend chart filtering
5. Add E2E tests for pending toggle behavior

## Best Practices

### For Users

1. **Use consistent date format:** YYYY-MM-DD is most reliable
2. **Remove currency symbols:** Use `42.99` not `$42.99`
3. **Check headers:** Ensure they match a supported format
4. **Review duplicates:** Check the duplicates count if some transactions aren't imported
5. **Use "Replace existing":** When re-importing the same period

### For Developers

1. **Always handle duplicates gracefully:** Never 500 on constraint violations
2. **Include headers_found in errors:** Helps users understand detection
3. **Log with safe keys:** Avoid reserved LogRecord attributes
4. **Test with realistic data:** Use actual bank exports, not toy examples
5. **Validate before insert:** Catch parse errors early, return friendly messages

## Troubleshooting

### "CSV format not recognized"

**Solution:** Check that your CSV has the required columns for at least one supported format. Header names are case-insensitive and punctuation-flexible.

**Example:** If your CSV has `Posting Date` and `Trans Amount`, rename to `date` and `amount`.

### "No transactions could be parsed"

**Solution:** Check that:

- Dates are in YYYY-MM-DD or MM/DD/YYYY format
- Amounts are numeric (no `$` or commas)
- Required columns are not empty

### All transactions show as duplicates

**Solution:** If you want to re-import, use the "Replace existing data" option (or delete existing transactions first).

**Note:** Duplicates are detected by `[date, amount, description]`, so identical transactions are skipped.

### Charts not populating after upload

**Solution:**

1. Check that `detected_month` is set in response
2. Verify `date_range` covers the expected period
3. Try refreshing the dashboard
4. Check browser console for errors
5. Use JSON toggle to inspect raw response

### 500 Internal Server Error

**Solution:**

1. Check backend logs for stack trace
2. Verify CSV is well-formed (no corrupt bytes)
3. Try uploading a smaller CSV to isolate the issue
4. Report to support with CSV sample (if not sensitive)

## Future Improvements

- [ ] Support for QFX/OFX formats
- [ ] Automatic date format detection
- [ ] Category auto-suggestion based on merchant
- [ ] Batch upload (multiple CSVs)
- [ ] Preview before import
- [ ] Column mapping UI for unknown formats
- [ ] Export templates for each supported format
