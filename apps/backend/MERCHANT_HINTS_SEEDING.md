# Merchant Category Hints Seeding

This directory contains tools to seed the `merchant_category_hints` table with known merchant→category mappings.

## Purpose

The merchant hints system allows LedgerMind to provide better category suggestions for transactions by learning which merchants typically belong to which categories.

## Quick Start

### 1. Prepare Your CSV

Create a CSV file with your labeled transactions:

```csv
date,description,merchant,amount,category
2025-10-01,NETFLIX.COM,NETFLIX,-15.99,subscriptions
2025-10-02,STEAM PURCHASE,STEAM GAMES,-59.99,games
2025-10-03,KAISER COPAY,KAISER,-30.00,medical
```

**Required columns:**
- `merchant` or `description` - The merchant name
- `category` - The category slug (lowercase, e.g., "subscriptions", "games", "medical")

**Optional columns:**
- `date`, `amount` - Ignored by the script but useful for record-keeping

### 2. Run the Seeder Script

#### Option A: From Host Machine

```bash
# Copy your CSV into the backend container
docker cp your_sample.csv ai-finance-backend:/app/data/seed_hints.csv

# Run the seeder script
docker exec ai-finance-backend python -m app.scripts.seed_hints_from_csv /app/data/seed_hints.csv
```

#### Option B: Using Sample Data

A sample CSV is included for testing:

```bash
docker cp sample_hints.csv ai-finance-backend:/app/data/seed_hints.csv
docker exec ai-finance-backend python -m app.scripts.seed_hints_from_csv /app/data/seed_hints.csv
```

### 3. Verify Results

Check the database to see the seeded hints:

```bash
docker exec lm-postgres psql -U lm -d lm -c \
  "SELECT merchant_canonical, category_slug, confidence, source
   FROM merchant_category_hints
   ORDER BY confidence DESC
   LIMIT 20;"
```

## How It Works

### Confidence Calculation

The script calculates confidence scores based on:

1. **Consistency** (40%): How consistently a merchant appears with the same category
   - 100% consistency → 0.4 points
   - 50% consistency → 0.2 points

2. **Volume** (20%): How many times we've seen this merchant→category pair
   - 10+ occurrences → 0.2 points
   - 5 occurrences → 0.1 points

3. **Base** (40%): Minimum confidence for any seed
   - All seeds start at 0.4

**Example:**
- NETFLIX appears 10 times, all as "subscriptions"
- Confidence = 0.4 (base) + 0.4 (100% consistency) + 0.2 (10+ volume) = 1.0 → capped at 0.99

### Upsert Logic

The script uses `ON CONFLICT ... DO UPDATE` to:
- Create new hints if they don't exist
- Keep the **higher** confidence if the hint already exists
- Preserve the original `source` if it was set

## Category Taxonomy

Make sure your CSV uses category slugs that exist in your system. Common categories:

- `subscriptions` - Streaming, memberships, recurring services
- `shopping` - General retail, online shopping
- `medical` - Healthcare, pharmacy, insurance
- `games` - Gaming, entertainment
- `transfers` - P2P transfers, Venmo, Zelle
- `groceries` - Food shopping
- `dining` - Restaurants, food delivery
- `utilities` - Bills, utilities, services
- `transport` - Gas, parking, rideshare

## Troubleshooting

### "File not found"
Ensure the CSV is copied into the container before running the script.

### "Column not found"
Your CSV must have at minimum:
- A merchant identifier (`merchant` or `description`)
- A `category` column

### "No hints created"
Check that:
- Your CSV has data rows (not just headers)
- Categories are lowercase slugs (not display names like "Subscriptions")
- Merchant names aren't empty

## Integration with ML Pipeline

Once seeded, these hints are used by:

1. **Unknowns suggestions**: When fetching ML suggestions for uncategorized transactions
2. **Feedback scoring**: Adjusting ML model scores based on known merchants
3. **Rule suggestions**: Helping identify patterns worth creating rules for

The hints work alongside:
- ML model predictions
- User feedback (from `ml_feedback_events`)
- Manual rules

## Next Steps

After seeding hints:

1. Test suggestions on the Unknowns panel
2. Train an ML model with your labeled data (see `PHASE_0_ML_TRAINING.md`)
3. Review and accept/reject suggestions to further improve the system
