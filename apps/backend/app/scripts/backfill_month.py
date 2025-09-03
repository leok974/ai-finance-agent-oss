# apps/backend/app/scripts/backfill_month.py
from __future__ import annotations

import argparse
from datetime import date
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.orm_models import Transaction


def _month_str(d: date) -> str:
    return d.strftime("%Y-%m")


def backfill_months(where_null_only: bool = False, target_month: Optional[str] = None) -> int:
    """
    Recompute Transaction.month from Transaction.date.

    - where_null_only=True: only rows where month IS NULL (default: False)
    - target_month="YYYY-MM": only update rows whose computed month equals this value
    Returns number of rows updated.
    """
    sess: Session = SessionLocal()
    updated = 0
    try:
        # Build a selectable for candidates
        stmt = select(Transaction.id, Transaction.date, Transaction.month)

        if where_null_only:
            stmt = stmt.where(Transaction.month.is_(None))

        rows = sess.execute(stmt).all()

        for (tid, d, m) in rows:
            if not isinstance(d, date):
                # Skip bad data
                continue
            new_month = _month_str(d)
            if target_month and new_month != target_month:
                continue
            if m == new_month:
                continue

            sess.execute(
                update(Transaction)
                .where(Transaction.id == tid)
                .values(month=new_month)
            )
            updated += 1

        sess.commit()
        return updated
    finally:
        sess.close()


def main():
    parser = argparse.ArgumentParser(
        description="Backfill Transaction.month from Transaction.date for the current DATABASE_URL."
    )
    parser.add_argument(
        "--where-null-only",
        action="store_true",
        help="Only update rows where month IS NULL (default: update any mismatched month).",
    )
    parser.add_argument(
        "--month",
        type=str,
        default=None,
        help='Only update rows whose computed month equals this value (format "YYYY-MM").',
    )
    args = parser.parse_args()

    n = backfill_months(where_null_only=args.where_null_only, target_month=args.month)
    print(f"Backfilled {n} rows.")


if __name__ == "__main__":
    main()
