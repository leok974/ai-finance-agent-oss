"""
Seed demo data for LedgerMind demo users.

This script provides an idempotent way to populate a user's account with
realistic transaction data from a CSV file for demonstration purposes.
"""

import csv
import datetime as dt
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.orm_models import Transaction
from app.utils.text import canonicalize_merchant

DEMO_CSV_PATH = Path(__file__).parent.parent / "sample_data" / "demo_transactions.csv"


INCOME_HINTS = (
    "payroll",
    "paycheck",
    "salary",
    "employer",
    "bonus",
    "refund",
    "reimbursement",
    "interest",
    "dividend",
    "income",
    "deposit",
    "transfer in",
)


def _parse_date(s: str | None) -> dt.date | None:
    """Parse date string to Python date object."""
    if not s:
        return None
    s = s.strip()
    # Try ISO first
    try:
        return dt.date.fromisoformat(s[:10])
    except Exception:
        pass
    # Try common formats
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(s[:10], fmt).date()
        except Exception:
            continue
    return None


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

    # Read and ingest demo CSV
    if not DEMO_CSV_PATH.exists():
        raise FileNotFoundError(
            f"Demo CSV not found at {DEMO_CSV_PATH}. "
            "Ensure sample_data/demo_transactions.csv exists."
        )

    with open(DEMO_CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        rows_added = 0
        for row in reader:
            # Parse date
            date_str = (row.get("date") or row.get("Date") or "").strip()
            date_obj = _parse_date(date_str)
            if not date_obj:
                continue

            month = date_obj.strftime("%Y-%m")

            # Parse merchant and description
            merchant = (
                row.get("merchant") or row.get("Merchant") or ""
            ).strip() or None
            description = (
                row.get("description") or row.get("Description") or ""
            ).strip() or None
            category = (
                row.get("category") or row.get("Category") or ""
            ).strip() or None

            # Parse amount
            amt_raw = (
                (row.get("amount") or row.get("Amount") or "0").replace(",", "").strip()
            )
            try:
                amount = float(amt_raw or 0)
            except Exception:
                amount = 0.0

            # Calculate canonical merchant for indexing
            merchant_canonical = canonicalize_merchant(merchant) if merchant else None

            # Create transaction
            txn = Transaction(
                user_id=user_id,
                date=date_obj,
                month=month,
                merchant=merchant,
                merchant_canonical=merchant_canonical,
                description=description,
                amount=amount,
                category=category,
                raw_category=category,  # Keep original category
                pending=False,
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
