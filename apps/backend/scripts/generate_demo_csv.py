#!/usr/bin/env python3
"""
Generate canonical demo CSV for LedgerMind sample data.

Purpose:
- Provides realistic 6-month transaction history for demo/testing
- Ensures charts have visually interesting variety (not flat/all-unknown)
- Creates deterministic data that matches backend category expectations

Usage:
    python apps/backend/scripts/generate_demo_csv.py

Output:
    apps/web/public/demo-sample.csv (used by "Use sample data" button)

Data characteristics:
- 6 months of history (June 2025 - November 2025)
- ~90 transactions total
- Varied monthly spending (±20-40% variation for visual interest)
- Multiple categories with realistic distributions
- Small number of unknown transactions (3) for ML demo
- Includes income, transfers, and diverse spending categories
"""

import csv
from pathlib import Path

# Canonical output path (single source of truth for UI "Use sample data")
REPO_ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_CSV = REPO_ROOT / "apps" / "web" / "public" / "demo-sample.csv"


def generate_demo_transactions():
    """Generate 6 months of realistic demo data with visual variety."""

    # Returns list of tuples: (date, merchant, description, amount, category)
    transactions = []

    # June 2025 - Baseline month (~$1750 spend)
    transactions.extend(
        [
            ("2025-06-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-06-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            (
                "2025-06-05",
                "Whole Foods Market",
                "Weekly groceries",
                -145.30,
                "groceries",
            ),
            ("2025-06-08", "Shell Gas Station", "Gas", -48.20, "fuel"),
            ("2025-06-10", "Chipotle", "Lunch", -32.50, "restaurants"),
            ("2025-06-12", "AT&T Wireless", "Phone bill", -85.00, "utilities.mobile"),
            ("2025-06-14", "Amazon", "Books & supplies", -87.45, "shopping.online"),
            ("2025-06-17", "Target", "Household", -76.30, "shopping.retail"),
            ("2025-06-20", "Steam", "Game", -29.99, "entertainment.games"),
            ("2025-06-22", "Uber", "Ride", -18.75, "transportation.rideshare"),
            (
                "2025-06-25",
                "Netflix",
                "Streaming",
                -15.99,
                "subscriptions.entertainment",
            ),
            ("2025-06-28", "GitHub", "Copilot", -10.00, "subscriptions.software"),
        ]
    )

    # July 2025 - Moderate increase (~$2100 spend) + freelance income
    transactions.extend(
        [
            ("2025-07-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-07-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            ("2025-07-05", "Whole Foods Market", "Groceries", -178.50, "groceries"),
            ("2025-07-08", "Shell Gas Station", "Gas", -55.40, "fuel"),
            ("2025-07-10", "Starbucks", "Coffee meetings", -52.30, "restaurants"),
            ("2025-07-12", "AT&T Wireless", "Phone bill", -85.00, "utilities.mobile"),
            ("2025-07-14", "Amazon", "Electronics", -234.99, "shopping.online"),
            (
                "2025-07-15",
                "Upwork Client",
                "Freelance project",
                800.00,
                "income.freelance",
            ),
            ("2025-07-17", "Target", "Clothes & groceries", -143.20, "shopping.retail"),
            ("2025-07-19", "PlayStation Store", "Game", -69.99, "entertainment.games"),
            ("2025-07-22", "Lyft", "Airport", -45.80, "transportation.rideshare"),
            (
                "2025-07-25",
                "Netflix",
                "Streaming",
                -15.99,
                "subscriptions.entertainment",
            ),
            ("2025-07-27", "Spotify", "Premium", -10.99, "subscriptions.entertainment"),
            ("2025-07-28", "GitHub", "Copilot", -10.00, "subscriptions.software"),
        ]
    )

    # August 2025 - Big spike month (~$2800 spend) - dental + vacation prep
    transactions.extend(
        [
            ("2025-08-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-08-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            (
                "2025-08-04",
                "Bright Smiles Dental",
                "Root canal",
                -850.00,
                "health.medical",
            ),
            ("2025-08-05", "Whole Foods Market", "Groceries", -198.75, "groceries"),
            ("2025-08-08", "Shell Gas Station", "Gas", -72.30, "fuel"),
            ("2025-08-10", "Olive Garden", "Dinner", -89.40, "restaurants"),
            ("2025-08-12", "AT&T Wireless", "Phone bill", -85.00, "utilities.mobile"),
            (
                "2025-08-14",
                "Amazon",
                "Luggage + travel gear",
                -387.50,
                "shopping.online",
            ),
            ("2025-08-17", "Target", "Toiletries & snacks", -112.80, "shopping.retail"),
            ("2025-08-19", "Steam", "Summer sale", -94.97, "entertainment.games"),
            (
                "2025-08-22",
                "Uber",
                "Multiple rides",
                -67.50,
                "transportation.rideshare",
            ),
            (
                "2025-08-25",
                "Netflix",
                "Streaming",
                -15.99,
                "subscriptions.entertainment",
            ),
            ("2025-08-27", "Spotify", "Premium", -10.99, "subscriptions.entertainment"),
            ("2025-08-28", "GitHub", "Copilot", -10.00, "subscriptions.software"),
            ("2025-08-30", "Comcast", "Internet", -79.99, "utilities.internet"),
        ]
    )

    # September 2025 - Back to baseline (~$2020 spend)
    transactions.extend(
        [
            ("2025-09-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-09-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            (
                "2025-09-05",
                "Whole Foods Market",
                "Grocery shopping",
                -187.45,
                "groceries",
            ),
            ("2025-09-08", "Shell Gas Station", "Gas for car", -62.30, "fuel"),
            ("2025-09-10", "Starbucks", "Coffee meetings", -45.80, "restaurants"),
            ("2025-09-12", "AT&T Wireless", "Phone bill", -85.00, "utilities.mobile"),
            ("2025-09-15", "Amazon", "Online shopping", -156.70, "shopping.online"),
            ("2025-09-18", "Target", "Household items", -132.90, "shopping.retail"),
            (
                "2025-09-20",
                "PlayStation Store",
                "New game",
                -79.99,
                "entertainment.games",
            ),
            ("2025-09-22", "Uber", "Weekend rides", -42.50, "transportation.rideshare"),
            (
                "2025-09-25",
                "Netflix",
                "Streaming",
                -15.99,
                "subscriptions.entertainment",
            ),
            (
                "2025-09-28",
                "GitHub",
                "Developer tools",
                -10.00,
                "subscriptions.software",
            ),
        ]
    )

    # October 2025 - Moderate high (~$2350 spend) + health insurance
    transactions.extend(
        [
            ("2025-10-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-10-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            (
                "2025-10-03",
                "Blue Shield",
                "Health insurance",
                -450.00,
                "health.insurance",
            ),
            (
                "2025-10-04",
                "Whole Foods Market",
                "Weekly groceries",
                -143.25,
                "groceries",
            ),
            ("2025-10-07", "Shell Gas Station", "Gas refill", -58.90, "fuel"),
            ("2025-10-09", "Chipotle", "Lunch meetings", -67.40, "restaurants"),
            ("2025-10-12", "AT&T Wireless", "Phone bill", -85.00, "utilities.mobile"),
            ("2025-10-14", "Amazon", "Electronics", -224.50, "shopping.online"),
            ("2025-10-17", "Target", "Groceries + supplies", -98.65, "shopping.retail"),
            ("2025-10-19", "Steam", "Game sale", -89.97, "entertainment.games"),
            ("2025-10-22", "Lyft", "Airport ride", -38.75, "transportation.rideshare"),
            (
                "2025-10-25",
                "Netflix",
                "Streaming",
                -15.99,
                "subscriptions.entertainment",
            ),
            (
                "2025-10-27",
                "Spotify",
                "Premium subscription",
                -10.99,
                "subscriptions.entertainment",
            ),
        ]
    )

    # November 2025 - Current month (~$2423 spend) + unknowns for ML demo
    transactions.extend(
        [
            ("2025-11-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-11-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            (
                "2025-11-03",
                "Whole Foods Market",
                "Grocery shopping",
                -162.70,
                "groceries",
            ),
            ("2025-11-04", "Starbucks", "Coffee with friends", -18.45, "restaurants"),
            ("2025-11-05", "Shell Gas Station", "Gas for car", -52.80, "fuel"),
            (
                "2025-11-06",
                "GitHub",
                "GitHub Copilot subscription",
                -10.00,
                "subscriptions.software",
            ),
            (
                "2025-11-07",
                "Netflix",
                "Streaming subscription",
                -15.99,
                "subscriptions.entertainment",
            ),
            ("2025-11-08", "Amazon", "Online shopping", -93.25, "shopping.online"),
            ("2025-11-09", "Target", "Household + snacks", -86.40, "shopping.retail"),
            (
                "2025-11-10",
                "PlayStation Store",
                "Game purchase",
                -79.99,
                "entertainment.games",
            ),
            ("2025-11-11", "Uber", "Airport ride", -34.15, "transportation.rideshare"),
            ("2025-11-12", "AT&T Wireless", "Phone bill", -85.00, "utilities.mobile"),
            ("2025-11-13", "Zelle Transfer", "Money to savings", -400.00, "transfers"),
            ("2025-11-14", "Zelle Transfer", "Money from savings", 400.00, "transfers"),
            # Unknown transactions for ML categorization demo (blank category)
            ("2025-11-15", "Unknown Coffee Shop", "POS PURCHASE - 8374", -14.37, ""),
            ("2025-11-16", "XYZ MARKET", "POS PURCHASE - 5493", -27.80, ""),
            ("2025-11-17", "RandomCharge", "WEB*RCG 10293", -8.99, ""),
            ("2025-11-18", "Whole Foods Market", "Grocery top-up", -68.20, "groceries"),
            ("2025-11-19", "Shell Gas Station", "Gas refill", -48.75, "fuel"),
            ("2025-11-20", "Panera Bread", "Lunch", -24.30, "restaurants"),
        ]
    )

    return transactions


def write_csv(transactions, output_path):
    """Write transactions to CSV file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "merchant", "description", "amount", "category"])

        for txn in transactions:
            writer.writerow(txn)

    print(f"✅ Generated {len(transactions)} transactions")
    print(f"📁 Written to: {output_path}")

    # Print summary statistics
    months = {}
    categories = {}
    unknowns = 0

    for date_str, merchant, desc, amount, category in transactions:
        month = date_str[:7]  # YYYY-MM
        months[month] = months.get(month, 0) + (amount if amount < 0 else 0)

        if category:
            categories[category] = categories.get(category, 0) + (
                abs(amount) if amount < 0 else 0
            )
        else:
            unknowns += 1

    print("\n📊 Monthly spending totals:")
    for month in sorted(months.keys()):
        print(f"  {month}: ${abs(months[month]):,.2f}")

    print(f"\n📂 Categories ({len(categories)} distinct):")
    for cat in sorted(categories.keys(), key=lambda c: categories[c], reverse=True)[
        :10
    ]:
        print(f"  {cat}: ${categories[cat]:,.2f}")

    print(f"\n❓ Unknown transactions: {unknowns}")


if __name__ == "__main__":
    transactions = generate_demo_transactions()
    write_csv(transactions, OUTPUT_CSV)
    print("\n✨ Demo CSV generation complete!")
    print("   Next steps:")
    print(
        "   1. Rebuild frontend: docker build -t ledgermind-web:main-demo-6mo apps/web"
    )
    print("   2. Update docker-compose.prod.yml to use new image")
    print("   3. Deploy: docker compose -f docker-compose.prod.yml up -d nginx")
    print("   4. Click 'Reset → Use sample data' in UI")
