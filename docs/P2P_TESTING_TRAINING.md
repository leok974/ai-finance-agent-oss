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

## E2E Testing

**Test File**: `apps/web/tests/e2e/suggestions-p2p.spec.ts`

Playwright E2E tests that validate P2P transaction detection in the Suggestions UI.

### What it Tests

1. **P2P Detection**: Verifies that transactions from Zelle, Venmo, Cash App, PayPal, and Apple Cash are detected
2. **Category Assignment**: Confirms they're categorized as "Transfers / P2P"
3. **Merchant Normalization**: Validates merchant names are properly cleaned

### Running the Tests

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

### Prerequisites

- At least one P2P transaction in the current month
- Redis and categorization pipeline operational
- Suggestions panel accessible on the main page

### Test Tags

- `@prod`: Production environment test
- `@suggestions`: Tests suggestions/unknowns functionality
- `@p2p`: Tests P2P-specific detection

## Workflow

1. **Generate Training Data**
   ```bash
   python -m app.scripts.export_p2p_training --min-date 2025-10
   ```

2. **Inspect CSV**
   - Open `data/p2p_training.csv`
   - Verify P2P transactions are correctly labeled
   - Check merchant normalization quality

3. **Run E2E Tests**
   ```bash
   pnpm exec playwright test tests/e2e/suggestions-p2p.spec.ts --project=chromium-prod
   ```

4. **Iterate**
   - If tests fail, check Redis cache and categorization rules
   - If training data looks wrong, review `user_labels` table and heuristics
   - Update P2P detection patterns in categorization logic if needed

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
