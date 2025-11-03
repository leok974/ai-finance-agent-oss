#!/usr/bin/env python3
"""
Seed demo transactions for testing batch categorization.

Inserts a handful of demo transactions with known merchants
and prints their DB IDs as JSON for use in batch API tests.

Usage:
    python -m app.scripts.seed_txns_demo

Returns:
    JSON array of inserted transaction IDs
"""
from datetime import date
import json
from sqlalchemy import select
from app.db import SessionLocal
from app.models import Transaction

DEMO = [
    ("2025-08-12", "SPOTIFY", "Premium Monthly", -12.99),
    ("2025-08-14", "UBER", "Trip 3.2mi", -18.50),
    ("2025-08-18", "STARBUCKS", "Latte", -5.45),
    ("2025-08-20", "COMCAST", "Internet", -79.99),
    ("2025-08-22", "DELTA AIR", "Flight DCA→PIT", -156.40),
    ("2025-08-24", "SHELL", "Fuel", -42.13),
]


def main():
    """Insert demo transactions and print their IDs as JSON."""
    db = SessionLocal()
    ids = []
    try:
        for d, m, desc, amt in DEMO:
            # Check if transaction already exists
            existing = db.execute(
                select(Transaction).where(
                    Transaction.date == date.fromisoformat(d),
                    Transaction.amount == amt,
                    Transaction.description == desc,
                )
            ).scalar_one_or_none()

            if existing:
                ids.append(existing.id)
                continue

            # Insert new transaction
            t = Transaction(
                date=date.fromisoformat(d),
                merchant=m,
                description=desc,
                amount=amt,
                # leave category_slug NULL for the panel to categorize
            )
            db.add(t)
            db.flush()
            ids.append(t.id)
        db.commit()
        print(json.dumps(ids))
    finally:
        db.close()


if __name__ == "__main__":
    main()
