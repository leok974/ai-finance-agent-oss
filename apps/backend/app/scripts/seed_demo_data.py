"""
Seed demo data for LedgerMind demo users.

This script provides an idempotent way to populate a user's account with
realistic transaction data for demonstration purposes.

Generates 6 months of varied transactions across multiple categories and merchants
to showcase spending trends, top categories, and forecast features.
"""

import random
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.orm_models import Transaction

# ============================================================================
# Demo Merchant Universe
# ============================================================================
# Format: (raw_description, category_slug, min_amount, max_amount, merchant_key)

DEMO_MERCHANTS = [
    # Groceries
    ("WHOLEFDS FAIRFAX", "groceries", 35, 120, "Whole Foods"),
    ("GIANT FOOD #3142", "groceries", 25, 90, "Giant"),
    ("COSTCO WHSE #229", "groceries", 60, 180, "Costco"),
    ("TRADER JOES #142", "groceries", 30, 85, "Trader Joes"),
    # Restaurants
    ("CHIPOTLE #2743", "restaurants", 12, 45, "Chipotle"),
    ("STARBUCKS 04213", "coffee", 6, 18, "Starbucks"),
    ("UBER EATS *ORDER", "restaurants", 20, 60, "Uber Eats"),
    ("PANERA BREAD #1234", "restaurants", 10, 25, "Panera"),
    ("FIVE GUYS #0456", "restaurants", 15, 35, "Five Guys"),
    # Transport
    ("SHELL OIL 12345678", "transportation.fuel", 30, 80, "Shell"),
    ("LYFT *TRIP", "transportation.ride_hailing", 15, 40, "Lyft"),
    ("UBER *TRIP", "transportation.ride_hailing", 12, 35, "Uber"),
    ("METRO TRANSIT", "transportation.public", 5, 15, "Metro"),
    # Bills / utilities
    ("DOMINION ENERGY VA", "housing.utilities", 80, 160, "Dominion"),
    ("COMCAST *INTERNET", "housing.utilities.internet", 60, 120, "Comcast"),
    ("VERIZON WIRELESS", "housing.utilities.mobile", 45, 95, "Verizon"),
    # Subscriptions
    ("SPOTIFY USA", "subscriptions.streaming", 8, 12, "Spotify"),
    ("NETFLIX.COM", "subscriptions.streaming", 12, 20, "Netflix"),
    ("ADOBE *CREATIVE CLD", "subscriptions.software", 25, 35, "Adobe"),
    ("AMAZON PRIME MBRSHP", "subscriptions.storage", 10, 15, "Amazon Prime"),
    # Shopping / misc
    ("AMAZON MKTPLACE PMTS", "shopping", 20, 150, "Amazon"),
    ("TARGET T-1234", "shopping", 20, 120, "Target"),
    ("WALMART SUPERCENTER", "shopping", 20, 120, "Walmart"),
    ("BEST BUY #00123", "shopping.electronics", 50, 300, "Best Buy"),
    # Health
    ("CVS/PHARMACY #02006", "health.pharmacy", 15, 60, "CVS"),
    ("WALGREENS #4532", "health.pharmacy", 12, 55, "Walgreens"),
    ("URGENT CARE FAIRFAX", "medical", 120, 220, "UrgentCare"),
    # Entertainment
    ("STEAMGAMES.COM", "games", 15, 60, "Steam"),
    ("AMC THEATRES 1234", "entertainment", 10, 45, "AMC"),
    ("REGAL CINEMAS", "entertainment", 12, 40, "Regal"),
]

DEMO_INCOME_SOURCES = [
    ("ACME CORP PAYROLL", "income.salary", 2200, 2600, "Salary"),
    ("PAYPAL *FREELANCE", "income.salary", 150, 600, "Freelance"),
    ("IRS TREAS 310 TAX REF", "income.refund", 500, 1200, "Tax Refund"),
]

DEMO_TRANSFER_SOURCES = [
    ("TRANSFER TO SAVINGS", "transfers", 150, 350, "TransferOut"),
    ("TRANSFER FROM SAVINGS", "transfers", 150, 350, "TransferIn"),
]


# ============================================================================
# Date Generation
# ============================================================================


def iter_demo_dates(months_back: int = 6) -> list[date]:
    """
    Return a list of dates covering last N months with nice spread.

    Args:
        months_back: Number of months to go back from today

    Returns:
        Sorted list of dates with ~8 activity days per month
    """
    today = date.today().replace(day=15)  # middle of month for stability
    dates: list[date] = []

    for m in range(months_back):
        # Calculate month and year going backwards
        month_offset = today.month - m - 1
        year = today.year
        month = month_offset

        # Handle year wraparound
        while month <= 0:
            month += 12
            year -= 1

        # Create ~8 activity days per month (realistic transaction frequency)
        for day in (2, 5, 8, 12, 16, 20, 24, 27):
            try:
                dates.append(date(year, month, day))
            except ValueError:
                # Handle months with fewer than 30 days
                continue

    return sorted(dates)


# ============================================================================
# Transaction Generation
# ============================================================================


def make_demo_row(
    d: date,
    raw_desc: str,
    amount: float,
    category_slug: str,
    merchant_key: str,
    user_id: int,
) -> dict:
    """
    Build a dict for creating a Transaction.

    Args:
        d: Transaction date
        raw_desc: Raw merchant description (e.g., "STARBUCKS 04213")
        amount: Amount (negative for spend, positive for income)
        category_slug: Category slug from VALID_CATEGORIES
        merchant_key: Canonical merchant identifier
        user_id: User ID for this transaction

    Returns:
        Dict with all fields for Transaction creation
    """
    return {
        "date": d,
        "description": raw_desc,
        "merchant": raw_desc,
        "merchant_raw": raw_desc,
        "merchant_canonical": merchant_key,
        "amount": amount,
        "category": category_slug,
        "raw_category": category_slug,
        "month": d.strftime("%Y-%m"),
        "pending": False,
        "user_id": user_id,
    }


def generate_demo_transactions(user_id: int) -> list[dict]:
    """
    Generate 6 months of realistic demo transactions.

    Creates a mix of:
    - Regular income (biweekly paychecks)
    - Daily spending across multiple categories
    - Occasional transfers
    - Monthly bills/subscriptions

    Args:
        user_id: User ID to associate transactions with

    Returns:
        List of transaction dicts ready for DB insertion
    """
    rows: list[dict] = []
    rng = random.Random(42)  # Fixed seed for reproducibility

    dates = iter_demo_dates(6)

    for d in dates:
        # 1) Income on 1st and 15th of month (biweekly paycheck)
        if d.day in (1, 15):
            src, cat, lo, hi, merchant_key = rng.choice(DEMO_INCOME_SOURCES)
            amount = rng.randint(lo, hi)
            rows.append(make_demo_row(d, src, amount, cat, merchant_key, user_id))

        # 2) Tax refund once (simulate one-time income)
        if d.month == (date.today().month - 2) % 12 or 1 and d.day == 12:
            for src, cat, lo, hi, merchant_key in DEMO_INCOME_SOURCES:
                if "TAX REF" in src:
                    amount = rng.randint(lo, hi)
                    rows.append(
                        make_demo_row(d, src, amount, cat, merchant_key, user_id)
                    )
                    break

        # 3) Monthly bills (on specific days to simulate auto-pay)
        if d.day == 2:  # Utilities on 2nd
            for desc, cat, lo, hi, merchant_key in DEMO_MERCHANTS:
                if "DOMINION" in desc or "COMCAST" in desc or "VERIZON" in desc:
                    amount = -rng.randint(lo, hi)
                    rows.append(
                        make_demo_row(d, desc, amount, cat, merchant_key, user_id)
                    )

        if d.day == 5:  # Subscriptions on 5th
            for desc, cat, lo, hi, merchant_key in DEMO_MERCHANTS:
                if any(
                    s in desc for s in ["SPOTIFY", "NETFLIX", "ADOBE", "AMAZON PRIME"]
                ):
                    amount = -rng.randint(lo, hi)
                    rows.append(
                        make_demo_row(d, desc, amount, cat, merchant_key, user_id)
                    )

        # 4) Regular spending: 3-6 transactions per active day
        num_txns = rng.randint(3, 6)
        for _ in range(num_txns):
            desc, cat, lo, hi, merchant_key = rng.choice(DEMO_MERCHANTS)
            # Skip bills/subscriptions (already added above)
            if any(
                s in desc
                for s in [
                    "DOMINION",
                    "COMCAST",
                    "VERIZON",
                    "SPOTIFY",
                    "NETFLIX",
                    "ADOBE",
                    "AMAZON PRIME",
                ]
            ):
                continue
            amount = -rng.randint(lo, hi)
            rows.append(make_demo_row(d, desc, amount, cat, merchant_key, user_id))

        # 5) Occasional transfers (25% chance per day)
        if rng.random() < 0.25:
            desc, cat, lo, hi, merchant_key = rng.choice(DEMO_TRANSFER_SOURCES)
            # Positive for "FROM SAVINGS", negative for "TO SAVINGS"
            sign = 1 if "FROM" in desc else -1
            amount = sign * rng.randint(lo, hi)
            rows.append(make_demo_row(d, desc, amount, cat, merchant_key, user_id))

    return rows


# ============================================================================
# Seeding Logic
# ============================================================================


def seed_demo_data_for_user(db: Session, user_id: int) -> bool:
    """
    Ensure the given user has demo data.

    Args:
        db: Database session
        user_id: User ID to seed data for

    Returns:
        True if data was created, False if it was already present.
    """
    # Check if user already has any transactions
    existing = db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .where(Transaction.deleted_at.is_(None))
        .limit(1)
    ).first()

    if existing:
        return False

    # Generate demo transactions
    rows = generate_demo_transactions(user_id)

    # Insert transactions
    rows_added = 0
    for row in rows:
        txn = Transaction(
            user_id=row["user_id"],
            date=row["date"],
            month=row["month"],
            merchant=row["merchant"],
            merchant_canonical=row["merchant_canonical"],
            description=row["description"],
            amount=row["amount"],
            category=row["category"],
            raw_category=row["raw_category"],
            pending=row["pending"],
        )
        db.add(txn)
        rows_added += 1

    db.commit()
    print(f"✓ Seeded {rows_added} demo transactions for user {user_id}")
    return True


def main(user_id: Optional[int] = None) -> None:
    """CLI entry point for seeding demo data."""
    if user_id is None:
        raise SystemExit(
            "Usage: python -m app.scripts.seed_demo_data <user_id>\n"
            "Example: python -m app.scripts.seed_demo_data 6"
        )

    db = SessionLocal()
    try:
        created = seed_demo_data_for_user(db, user_id=user_id)
        if created:
            print(f"✓ Demo data successfully seeded for user {user_id}")
        else:
            print(f"ℹ User {user_id} already has transactions. No data added.")
    finally:
        db.close()


if __name__ == "__main__":
    import sys

    uid = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(uid)
