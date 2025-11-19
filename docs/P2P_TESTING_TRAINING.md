# P2P Detection Testing & Training Tools

This directory contains tools for testing and training the P2P transaction detection system.

## Training Data Export

**Script**: `apps/backend/app/scripts/export_p2p_training.py`

Exports all transactions labeled as "Transfers / P2P" from the database to CSV format for inspection and ML training.

### Usage

```bash
# Export all P2P transactions to default path (data/p2p_training.csv)
cd apps/backend
python -m app.scripts.export_p2p_training

# Export with date filters
python -m app.scripts.export_p2p_training --min-date 2025-10 --max-date 2025-11

# Export to custom path
python -m app.scripts.export_p2p_training --output data/p2p_2025Q4.csv

# Limit number of rows
python -m app.scripts.export_p2p_training --limit 100
```

### CSV Output Format

The exported CSV contains the following columns:

- `txn_id`: Transaction ID
- `date`: Transaction date (ISO format)
- `month`: Month (YYYY-MM)
- `amount`: Transaction amount
- `merchant`: Original merchant name
- `description`: Transaction description
- `category`: Assigned category ("Transfers / P2P")
- `normalized_merchant`: Cleaned merchant name
- `merchant_kind`: Merchant classification

### Example Output

```csv
txn_id,date,month,amount,merchant,description,category,normalized_merchant,merchant_kind
123,2025-11-15,2025-11,250.00,Zelle Payment,NOW Withdrawal,Transfers / P2P,Zelle,p2p
124,2025-11-16,2025-11,-100.00,Venmo,Payment to John,Transfers / P2P,Venmo,p2p
```

## Training Data Analysis

**Script**: `apps/backend/app/scripts/analyze_p2p_training.py`

Analyzes the exported P2P training CSV and prints useful statistics about the data.

### Usage

```bash
# Analyze default CSV
cd apps/backend
python -m app.scripts.analyze_p2p_training

# Analyze custom CSV
python -m app.scripts.analyze_p2p_training --input data/p2p_2025Q4.csv
```

### Output

The analyzer provides:
- **Total counts**: Number of transactions, categories, merchants
- **Amount statistics**: Min, max, mean, median, p90, p95
- **Per-merchant stats**: Amount distribution for top merchants
- **Sample rows**: Preview of actual data

### Example Analysis Output

```
📊 P2P training analysis for data/p2p_training.csv
====================================

Total rows: 42
Categories:
  - Transfers / P2P: 42

Top 10 merchants (normalized fallback → raw):
  - Zelle: 15
  - Venmo: 12
  - Cash App: 8
  - PayPal: 5
  - Apple Cash: 2

Amount stats (all rows):
  count : 42
  min   : -500.00
  max   : 1200.00
  mean  : 125.50
  median: 100.00
  p90   : 350.00
  p95   : 450.00

Per-merchant amount stats (top 5 merchants by count):
  • Zelle:
      n    = 15
      mean = 150.00
      med  = 100.00
      p90  = 300.00

Sample rows (up to 5):
  - #123 2025-11-15 250.00 | Zelle
  - #124 2025-11-16 -100.00 | Venmo

✅ Done.
```

## E2E Testing

### Suggestions Panel Tests

**Test File**: `apps/web/tests/e2e/suggestions-p2p.spec.ts`

Playwright E2E tests that validate P2P transaction detection in the Suggestions UI.

#### What it Tests

1. **P2P Detection**: Verifies that transactions from Zelle, Venmo, Cash App, PayPal, and Apple Cash are detected
2. **Category Assignment**: Confirms they're categorized as "Transfers / P2P"
3. **Merchant Normalization**: Validates merchant names are properly cleaned

#### Running the Tests

```bash
# From apps/web directory
cd apps/web

# Run against production
$env:BASE_URL = 'https://app.ledger-mind.org'
pnpm exec playwright test tests/e2e/suggestions-p2p.spec.ts --project=chromium-prod --reporter=line

# Run with UI
pnpm exec playwright test tests/e2e/suggestions-p2p.spec.ts --project=chromium-prod --ui

# Run with debug output
pnpm exec playwright test tests/e2e/suggestions-p2p.spec.ts --project=chromium-prod --debug
```

#### Prerequisites

- At least one P2P transaction in the current month
- Redis and categorization pipeline operational
- Suggestions panel accessible on the main page

#### Test Tags

- `@prod`: Production environment test
- `@suggestions`: Tests suggestions/unknowns functionality
- `@p2p`: Tests P2P-specific detection

### Admin Backfill Tests

**Test File**: `apps/web/tests/e2e/admin-backfill-p2p.spec.ts`

E2E tests for the admin P2P backfill maintenance endpoint.

#### What it Tests

1. **Dry-run Mode**: Validates endpoint returns statistics without modifying data
2. **Month Filtering**: Confirms month parameter filters results correctly
3. **Authentication**: Verifies admin token is required
4. **Response Structure**: Validates response contains analyzed, matched, updated counts
5. **Sample Merchants**: Checks sample_merchants array is populated

#### Running the Tests

```bash
# From apps/web directory
cd apps/web

# Set admin token and run
$env:BASE_URL = 'https://app.ledger-mind.org'
$env:ADMIN_TOKEN = '<your-admin-token>'
pnpm exec playwright test tests/e2e/admin-backfill-p2p.spec.ts --project=chromium-prod --reporter=line

# Run with debug output
pnpm exec playwright test tests/e2e/admin-backfill-p2p.spec.ts --project=chromium-prod --debug
```

#### Response Structure

The endpoint returns:
```json
{
  "dry_run": true,
  "analyzed": 123,
  "matched": 7,
  "updated": 0,
  "sample_merchants": [
    "NOW Withdrawal → Zelle (p2p)",
    "Venmo → Venmo (p2p)"
  ]
}
```

#### Test Tags

- `@prod`: Production environment test
- `@admin`: Admin-only endpoint
- `@p2p`: P2P-specific functionality

## Workflow

### Full Training Data Pipeline

1. **Generate Training Data**
   ```bash
   # Export P2P transactions to CSV
   python -m app.scripts.export_p2p_training --min-date 2025-10
   ```

2. **Analyze CSV**
   ```bash
   # Get statistics and verify data quality
   python -m app.scripts.analyze_p2p_training
   ```

3. **Inspect CSV Manually**
   - Open `data/p2p_training.csv` in spreadsheet
   - Verify P2P transactions are correctly labeled
   - Check merchant normalization quality
   - Review amount distributions

4. **Run E2E Tests**
   ```bash
   # Test suggestions panel
   pnpm exec playwright test tests/e2e/suggestions-p2p.spec.ts --project=chromium-prod

   # Test admin backfill endpoint
   $env:ADMIN_TOKEN = '<your-token>'
   pnpm exec playwright test tests/e2e/admin-backfill-p2p.spec.ts --project=chromium-prod
   ```

5. **Iterate**
   - If tests fail, check Redis cache and categorization rules
   - If training data looks wrong, review `user_labels` table and heuristics
   - Update P2P detection patterns in categorization logic if needed

### Backfill Existing Transactions

Use the admin endpoint to bulk-categorize P2P transactions:

```bash
# Preview changes (dry-run)
curl -X POST "https://app.ledger-mind.org/admin/maintenance/backfill-p2p-transfers?dry_run=true" \
  -H "X-Admin-Token: <your-token>" \
  -H "Content-Type: application/json"

# Apply changes to current month
curl -X POST "https://app.ledger-mind.org/admin/maintenance/backfill-p2p-transfers?dry_run=false&month=2025-11" \
  -H "X-Admin-Token: <your-token>" \
  -H "Content-Type: application/json"

# Export and analyze results
python -m app.scripts.export_p2p_training --min-date 2025-11
python -m app.scripts.analyze_p2p_training
```

## Integration with ML Pipeline

Once you have sufficient training data:

```bash
# Build features (includes P2P flags)
python -m app.ml.feature_build --days 180

# Train model
python -m app.ml.train

# Verify model learned P2P patterns
python -c "from app.ml.registry import latest_meta; meta = latest_meta(); print('Classes:', meta.get('classes', []) if meta else 'No model')"
```

The ML model will learn from the labeled P2P transactions and can augment the heuristic rules with pattern-based detection.
