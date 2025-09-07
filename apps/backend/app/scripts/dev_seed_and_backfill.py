# apps/backend/app/scripts/dev_seed_and_backfill.py
from __future__ import annotations

import argparse
from pathlib import Path

from app.scripts.seed_demo import seed as seed_demo, _default_sample_csv
from app.db import SessionLocal
from app.orm_models import Transaction
from sqlalchemy import func
import os, hashlib, random
from app.scripts.backfill_month import backfill_months


def main():
    p = argparse.ArgumentParser(
        description="Dev helper: seed transactions then backfill month for the current DATABASE_URL."
    )
    p.add_argument(
        "csv",
        nargs="?",
        type=Path,
        default=None,
        help="CSV path (defaults to app/data/samples/transactions_sample.csv)",
    )
    p.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing transactions before seeding",
    )
    p.add_argument(
        "--backfill-where-null-only",
        action="store_true",
        help="Only backfill rows where month IS NULL",
    )
    p.add_argument(
        "--backfill-month",
        type=str,
        default=None,
        help='Only backfill rows whose computed month equals this value (format "YYYY-MM")',
    )
    args = p.parse_args()

    csv_path = args.csv or _default_sample_csv()
    if not csv_path.exists():
        p.error(f"CSV not found: {csv_path}")

    added = seed_demo(csv_path, replace=args.replace)
    updated = backfill_months(
        where_null_only=args.backfill_where_null_only,
        target_month=args.backfill_month,
    )

    # Guarantee a few unknowns for UI/testing (reproducible)
    try:
        sess = SessionLocal()
        # Determine target month (latest in DB), filter IDs by month
        target_month = sess.query(func.max(Transaction.month)).scalar()
        if target_month:
            ids = [row[0] for row in sess.query(Transaction.id).filter(Transaction.month == target_month).all()]
        else:
            ids = [row[0] for row in sess.query(Transaction.id).all()]

        # Configurable count via env var
        try:
            desired = int(os.getenv("DEV_UNKNOWN_COUNT", "7"))
        except Exception:
            desired = 7

        # Deterministic per-month selection: hash month to seed RNG
        seed_value = hashlib.md5((target_month or "ALL").encode("utf-8")).digest()[:8]
        random.seed(int.from_bytes(seed_value, "big"))
        N = min(desired, len(ids))
        if N > 0:
            for txn_id in random.sample(ids, N):
                txn = sess.get(Transaction, txn_id)
                if txn:
                    txn.category = None
                    if hasattr(txn, "raw_category"):
                        txn.raw_category = None
            sess.commit()
            print(f"[dev_seed] Set {N} transactions to unknown category for demo (month={target_month}).")
        else:
            print("[dev_seed] No transactions found to mark as unknowns.")
    except Exception as e:
        print(f"[dev_seed] Skipped marking unknowns due to error: {e}")
    finally:
        try:
            sess.close()
        except Exception:
            pass

    print(
        f"Done. Seeded {added} transactions from {csv_path}. "
        f"Backfilled {updated} rows."
    )


if __name__ == "__main__":
    main()
