#!/usr/bin/env python3
"""
Generate canonical demo CSV for LedgerMind sample data.

Purpose:
- Provides realistic 6-month transaction history for demo/testing
- Showcases merchant canonicalization with messy bank-style descriptions
- Ensures charts have visually interesting variety (not flat/all-unknown)
- Creates deterministic data that matches backend category expectations

Usage:
    python apps/backend/scripts/generate_demo_csv.py

Output:
    apps/web/public/demo-sample.csv (used by "Use sample data" button)

Data characteristics:
- 6 months of history (June 2025 - November 2025)
- ~90 transactions total
- Realistic messy merchant descriptions (bank feed style)
- Charts show clean canonical names via normalization
- Varied monthly spending (±20-40% variation for visual interest)
- Multiple categories with realistic distributions
- Small number of unknown transactions (10) for ML demo
- Includes income, transfers, and diverse spending categories
"""

import csv
import random
from pathlib import Path

# Canonical output path (single source of truth for UI "Use sample data")
REPO_ROOT = Path(__file__).parent.parent.parent.parent
OUTPUT_CSV = REPO_ROOT / "apps" / "web" / "public" / "demo-sample.csv"


# Canonical merchant groups with realistic messy variants
# This showcases LedgerMind's merchant canonicalization:
# - Raw descriptions appear in transaction list
# - Charts aggregate by canonical name
CANONICAL_MERCHANTS = {
    "Starbucks Coffee": {
        "variants": [
            "STARBUCKS #1234 SAN FRANCISCO CA",
            "STARBUCKS STORE 4321 FAIRFAX VA",
            "POS PURCHASE STARBUCKS #5678",
            "STARBUCKS 1234 - LATTE & SNACK",
            "SBX MOBILE ORDER #9876",
        ],
        "category": "restaurants",
    },
    "Target": {
        "variants": [
            "TARGET #1023 HOUSEHOLD + SNACKS",
            "TARGET 0001023 FAIRFAX VA",
            "POS PURCHASE TARGET T1023",
            "TARGET.COM *ONLINE ORDER",
            "TARGET MOBILE #1023",
        ],
        "category": "shopping.retail",
    },
    "Amazon": {
        "variants": [
            "AMZN Mktp US*7H23K1AB2",
            "AMAZON.COM*MARKETPLACE PMTS",
            "AMZN DIGITAL VIDEO",
            "AMAZON WEB SERVICES AWS.AMAZON.COM",
            "AMZN Mktp US*2J8KL9BC1",
        ],
        "category": "shopping.online",
    },
    "Uber": {
        "variants": [
            "UBER *TRIP HELP.UBER.COM",
            "UBER *PENDING HELP.UBER.COM",
            "UBER TRIP SANDBOX US",
            "UBER *EATS ORDER",
            "UBER BV HELP.UBER.COM",
        ],
        "category": "transportation.rideshare",
    },
    "Lyft": {
        "variants": [
            "LYFT *RIDE SAN FRANCISCO CA",
            "LYFT *PENDING AUTH",
            "LYFT *RIDE 123456",
            "LYFT RIDE THU 7PM",
        ],
        "category": "transportation.rideshare",
    },
    "Whole Foods Market": {
        "variants": [
            "WHOLEFDS FAIRFAX 1234",
            "WHOLE FOODS MARKET #1234",
            "WFM #1234 SAN FRANCISCO",
            "WHOLE FOODS MKT FAIRFAX",
            "WHOLEFDS #1234",
        ],
        "category": "groceries",
    },
    "Shell Gas Station": {
        "variants": [
            "SHELL OIL 12345678910",
            "SHELL SERVICE STATION 1234",
            "SHELL #4521 GAS & SNACKS",
            "SHELL 123456 PUMP 3",
            "SHELL OIL #1234",
        ],
        "category": "fuel",
    },
    "Netflix": {
        "variants": [
            "NETFLIX.COM LOS GATOS CA",
            "NETFLIX.COM AMSTERDAM",
            "NETFLIX SUBSCRIPTION",
            "NETFLIX.COM STREAMING",
        ],
        "category": "subscriptions.entertainment",
    },
    "Spotify": {
        "variants": [
            "SPOTIFY P0N13 STOCKHOLM",
            "SPOTIFY USA 123456",
            "SPOTIFY SUBSCRIPTION NY",
            "SPOTIFY PREMIUM",
        ],
        "category": "subscriptions.entertainment",
    },
    "Chipotle": {
        "variants": [
            "CHIPOTLE #1234 FAIRFAX VA",
            "CHIPOTLE MEXICAN GRILL",
            "CHIPOTLE 1234",
            "CMG #1234 LUNCH",
        ],
        "category": "restaurants",
    },
    "AT&T": {
        "variants": [
            "AT&T *WIRELESS 800-331-0500",
            "ATT*BILL PAYMENT",
            "AT&T MOBILITY",
            "ATT WIRELESS PMT",
        ],
        "category": "utilities.mobile",
    },
    "GitHub": {
        "variants": [
            "GITHUB *COPILOT 415-123-4567",
            "GITHUB, INC. COPILOT",
            "GITHUB SUBSCRIPTION",
            "GITHUB.COM COPILOT",
        ],
        "category": "subscriptions.software",
    },
    "PlayStation Store": {
        "variants": [
            "PLAYSTATION NETWORK",
            "SONY PLAYSTATION NETWORK",
            "PSN*GAME PURCHASE",
            "PLAYSTATION*STORE",
        ],
        "category": "entertainment.games",
    },
    "Steam": {
        "variants": [
            "STEAM GAMES 425-952-2985",
            "STEAMPOWERED.COM",
            "STEAM PURCHASE",
            "VALVE*STEAM GAMES",
        ],
        "category": "entertainment.games",
    },
    "Olive Garden": {
        "variants": [
            "OLIVE GARDEN #1234",
            "THE OLIVE GARDEN FAIRFAX",
            "OLIVEGARDEN.COM ORDER",
        ],
        "category": "restaurants",
    },
}


def get_messy_merchant(canonical_name):
    """Get a random messy variant for a canonical merchant."""
    merchant_data = CANONICAL_MERCHANTS.get(canonical_name)
    if not merchant_data:
        return canonical_name, canonical_name

    variant = random.choice(merchant_data["variants"])
    return canonical_name, variant


def generate_demo_transactions():
    """Generate 6 months of realistic demo data with visual variety."""

    # Returns list of tuples: (date, merchant, description, amount, category)
    transactions = []

    # June 2025 - Baseline month (~$1750 spend)
    # Income/transfers use clean names; merchants use messy variants
    transactions.extend(
        [
            ("2025-06-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-06-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
        ]
    )

    # Add messy merchant transactions
    canonical, variant = get_messy_merchant("Whole Foods Market")
    transactions.append(
        ("2025-06-05", variant, "Weekly groceries", -145.30, "groceries")
    )

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-06-08", variant, "Gas", -48.20, "fuel"))

    canonical, variant = get_messy_merchant("Chipotle")
    transactions.append(("2025-06-10", variant, "Lunch", -32.50, "restaurants"))

    canonical, variant = get_messy_merchant("AT&T")
    transactions.append(
        ("2025-06-12", variant, "Phone bill", -85.00, "utilities.mobile")
    )

    canonical, variant = get_messy_merchant("Amazon")
    transactions.append(
        ("2025-06-14", variant, "Books & supplies", -87.45, "shopping.online")
    )

    canonical, variant = get_messy_merchant("Target")
    transactions.append(("2025-06-17", variant, "Household", -76.30, "shopping.retail"))

    canonical, variant = get_messy_merchant("Steam")
    transactions.append(("2025-06-20", variant, "Game", -29.99, "entertainment.games"))

    canonical, variant = get_messy_merchant("Uber")
    transactions.append(
        ("2025-06-22", variant, "Ride", -18.75, "transportation.rideshare")
    )

    canonical, variant = get_messy_merchant("Netflix")
    transactions.append(
        ("2025-06-25", variant, "Streaming", -15.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("GitHub")
    transactions.append(
        ("2025-06-28", variant, "Copilot", -10.00, "subscriptions.software")
    )

    # July 2025 - Moderate increase (~$2100 spend) + freelance income
    transactions.extend(
        [
            ("2025-07-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-07-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            (
                "2025-07-15",
                "Upwork Client",
                "Freelance project",
                800.00,
                "income.freelance",
            ),
        ]
    )

    canonical, variant = get_messy_merchant("Whole Foods Market")
    transactions.append(("2025-07-05", variant, "Groceries", -178.50, "groceries"))

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-07-08", variant, "Gas", -55.40, "fuel"))

    canonical, variant = get_messy_merchant("Starbucks Coffee")
    transactions.append(
        ("2025-07-10", variant, "Coffee meetings", -52.30, "restaurants")
    )

    canonical, variant = get_messy_merchant("AT&T")
    transactions.append(
        ("2025-07-12", variant, "Phone bill", -85.00, "utilities.mobile")
    )

    canonical, variant = get_messy_merchant("Amazon")
    transactions.append(
        ("2025-07-14", variant, "Electronics", -234.99, "shopping.online")
    )

    canonical, variant = get_messy_merchant("Target")
    transactions.append(
        ("2025-07-17", variant, "Clothes & groceries", -143.20, "shopping.retail")
    )

    canonical, variant = get_messy_merchant("PlayStation Store")
    transactions.append(("2025-07-19", variant, "Game", -69.99, "entertainment.games"))

    canonical, variant = get_messy_merchant("Lyft")
    transactions.append(
        ("2025-07-22", variant, "Airport", -45.80, "transportation.rideshare")
    )

    canonical, variant = get_messy_merchant("Netflix")
    transactions.append(
        ("2025-07-25", variant, "Streaming", -15.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("Spotify")
    transactions.append(
        ("2025-07-27", variant, "Premium", -10.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("GitHub")
    transactions.append(
        ("2025-07-28", variant, "Copilot", -10.00, "subscriptions.software")
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
            ("2025-08-30", "Comcast", "Internet", -79.99, "utilities.internet"),
        ]
    )

    canonical, variant = get_messy_merchant("Whole Foods Market")
    transactions.append(("2025-08-05", variant, "Groceries", -198.75, "groceries"))

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-08-08", variant, "Gas", -72.30, "fuel"))

    canonical, variant = get_messy_merchant("Olive Garden")
    transactions.append(("2025-08-10", variant, "Dinner", -89.40, "restaurants"))

    canonical, variant = get_messy_merchant("AT&T")
    transactions.append(
        ("2025-08-12", variant, "Phone bill", -85.00, "utilities.mobile")
    )

    canonical, variant = get_messy_merchant("Amazon")
    transactions.append(
        ("2025-08-14", variant, "Luggage + travel gear", -387.50, "shopping.online")
    )

    canonical, variant = get_messy_merchant("Target")
    transactions.append(
        ("2025-08-17", variant, "Toiletries & snacks", -112.80, "shopping.retail")
    )

    canonical, variant = get_messy_merchant("Steam")
    transactions.append(
        ("2025-08-19", variant, "Summer sale", -94.97, "entertainment.games")
    )

    canonical, variant = get_messy_merchant("Uber")
    transactions.append(
        ("2025-08-22", variant, "Multiple rides", -67.50, "transportation.rideshare")
    )

    canonical, variant = get_messy_merchant("Netflix")
    transactions.append(
        ("2025-08-25", variant, "Streaming", -15.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("Spotify")
    transactions.append(
        ("2025-08-27", variant, "Premium", -10.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("GitHub")
    transactions.append(
        ("2025-08-28", variant, "Copilot", -10.00, "subscriptions.software")
    )

    # September 2025 - Back to baseline (~$2020 spend)
    transactions.extend(
        [
            ("2025-09-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-09-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
        ]
    )

    canonical, variant = get_messy_merchant("Whole Foods Market")
    transactions.append(
        ("2025-09-05", variant, "Grocery shopping", -187.45, "groceries")
    )

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-09-08", variant, "Gas for car", -62.30, "fuel"))

    canonical, variant = get_messy_merchant("Starbucks Coffee")
    transactions.append(
        ("2025-09-10", variant, "Coffee meetings", -45.80, "restaurants")
    )

    canonical, variant = get_messy_merchant("AT&T")
    transactions.append(
        ("2025-09-12", variant, "Phone bill", -85.00, "utilities.mobile")
    )

    canonical, variant = get_messy_merchant("Amazon")
    transactions.append(
        ("2025-09-15", variant, "Online shopping", -156.70, "shopping.online")
    )

    canonical, variant = get_messy_merchant("Target")
    transactions.append(
        ("2025-09-18", variant, "Household items", -132.90, "shopping.retail")
    )

    canonical, variant = get_messy_merchant("PlayStation Store")
    transactions.append(
        ("2025-09-20", variant, "New game", -79.99, "entertainment.games")
    )

    canonical, variant = get_messy_merchant("Uber")
    transactions.append(
        ("2025-09-22", variant, "Weekend rides", -42.50, "transportation.rideshare")
    )

    canonical, variant = get_messy_merchant("Netflix")
    transactions.append(
        ("2025-09-25", variant, "Streaming", -15.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("GitHub")
    transactions.append(
        ("2025-09-28", variant, "Developer tools", -10.00, "subscriptions.software")
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
        ]
    )

    canonical, variant = get_messy_merchant("Whole Foods Market")
    transactions.append(
        ("2025-10-04", variant, "Weekly groceries", -143.25, "groceries")
    )

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-10-07", variant, "Gas refill", -58.90, "fuel"))

    canonical, variant = get_messy_merchant("Chipotle")
    transactions.append(
        ("2025-10-09", variant, "Lunch meetings", -67.40, "restaurants")
    )

    canonical, variant = get_messy_merchant("AT&T")
    transactions.append(
        ("2025-10-12", variant, "Phone bill", -85.00, "utilities.mobile")
    )

    canonical, variant = get_messy_merchant("Amazon")
    transactions.append(
        ("2025-10-14", variant, "Electronics", -224.50, "shopping.online")
    )

    canonical, variant = get_messy_merchant("Target")
    transactions.append(
        ("2025-10-17", variant, "Groceries + supplies", -98.65, "shopping.retail")
    )

    canonical, variant = get_messy_merchant("Steam")
    transactions.append(
        ("2025-10-19", variant, "Game sale", -89.97, "entertainment.games")
    )

    canonical, variant = get_messy_merchant("Lyft")
    transactions.append(
        ("2025-10-22", variant, "Airport ride", -38.75, "transportation.rideshare")
    )

    canonical, variant = get_messy_merchant("Netflix")
    transactions.append(
        ("2025-10-25", variant, "Streaming", -15.99, "subscriptions.entertainment")
    )

    canonical, variant = get_messy_merchant("Spotify")
    transactions.append(
        (
            "2025-10-27",
            variant,
            "Premium subscription",
            -10.99,
            "subscriptions.entertainment",
        )
    )

    # November 2025 - Current month (~$2423 spend) + unknowns for ML demo
    transactions.extend(
        [
            ("2025-11-01", "ACME Corp", "Paycheck", 3200.00, "income.salary"),
            ("2025-11-02", "Rent Payment", "Monthly rent", -1200.00, "transfers"),
            ("2025-11-13", "Zelle Transfer", "Money to savings", -400.00, "transfers"),
            ("2025-11-14", "Zelle Transfer", "Money from savings", 400.00, "transfers"),
        ]
    )

    canonical, variant = get_messy_merchant("Whole Foods Market")
    transactions.append(
        ("2025-11-03", variant, "Grocery shopping", -162.70, "groceries")
    )

    canonical, variant = get_messy_merchant("Starbucks Coffee")
    transactions.append(
        ("2025-11-04", variant, "Coffee with friends", -18.45, "restaurants")
    )

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-11-05", variant, "Gas for car", -52.80, "fuel"))

    canonical, variant = get_messy_merchant("GitHub")
    transactions.append(
        (
            "2025-11-06",
            variant,
            "GitHub Copilot subscription",
            -10.00,
            "subscriptions.software",
        )
    )

    canonical, variant = get_messy_merchant("Netflix")
    transactions.append(
        (
            "2025-11-07",
            variant,
            "Streaming subscription",
            -15.99,
            "subscriptions.entertainment",
        )
    )

    canonical, variant = get_messy_merchant("Amazon")
    transactions.append(
        ("2025-11-08", variant, "Online shopping", -93.25, "shopping.online")
    )

    canonical, variant = get_messy_merchant("Target")
    transactions.append(
        ("2025-11-09", variant, "Household + snacks", -86.40, "shopping.retail")
    )

    canonical, variant = get_messy_merchant("PlayStation Store")
    transactions.append(
        ("2025-11-10", variant, "Game purchase", -79.99, "entertainment.games")
    )

    canonical, variant = get_messy_merchant("Uber")
    transactions.append(
        ("2025-11-11", variant, "Airport ride", -34.15, "transportation.rideshare")
    )

    canonical, variant = get_messy_merchant("AT&T")
    transactions.append(
        ("2025-11-12", variant, "Phone bill", -85.00, "utilities.mobile")
    )

    # Unknown transactions for ML categorization demo (blank category)
    # Using recognizable real-world merchants with messy variants
    canonical, variant = get_messy_merchant("Starbucks Coffee")
    transactions.append(("2025-11-15", variant, variant, -14.37, ""))

    canonical, variant = get_messy_merchant("Target")
    transactions.append(("2025-11-16", variant, variant, -27.80, ""))

    canonical, variant = get_messy_merchant("Shell Gas Station")
    transactions.append(("2025-11-17", variant, variant, -42.15, ""))

    # Additional unknowns (non-canonical merchants for variety)
    transactions.extend(
        [
            (
                "2025-11-18",
                "DOORDASH *LUNCH ORDER",
                "DOORDASH *LUNCH ORDER",
                -28.45,
                "",
            ),
            (
                "2025-11-19",
                "CVS #8923 - MEDICINE & SNACKS",
                "CVS #8923 - MEDICINE & SNACKS",
                -31.22,
                "",
            ),
            (
                "2025-11-20",
                "PANERA #445 - BREAKFAST",
                "PANERA #445 - BREAKFAST",
                -16.85,
                "",
            ),
            (
                "2025-11-21",
                "MCD #2341 - DRIVE THRU",
                "MCD #2341 - DRIVE THRU",
                -12.47,
                "",
            ),
            (
                "2025-11-22",
                "COSTCO WHOLESALE #123",
                "COSTCO WHOLESALE #123",
                -156.38,
                "",
            ),
            (
                "2025-11-23",
                "APPLE.COM/BILL - APP PURCHASE",
                "APPLE.COM/BILL - APP PURCHASE",
                -4.99,
                "",
            ),
            (
                "2025-11-24",
                "WALGREENS #5421 - TOILETRIES",
                "WALGREENS #5421 - TOILETRIES",
                -22.67,
                "",
            ),
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
