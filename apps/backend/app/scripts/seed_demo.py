# apps/backend/app/scripts/seed_demo.py
from __future__ import annotations

import csv
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
import os
import random
import hashlib
from sqlalchemy import func

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.orm_models import Transaction


def _default_sample_csv() -> Path:
    """
    Compute the default sample CSV path:
    .../apps/backend/app/data/samples/transactions_sample.csv
    """
    # current file: .../apps/backend/app/scripts/seed_demo.py
    app_dir = Path(__file__).resolve().parents[1]  # .../app
    return app_dir / "data" / "samples" / "transactions_sample.csv"


def _parse_date(val: str) -> datetime.date:
    # Strict ISO first; extend here if your samples vary
    return datetime.strptime(val.strip(), "%Y-%m-%d").date()


def _row_to_txn(row: Dict[str, Any]) -> Transaction:
    """
    Map a CSV row to Transaction. Supports a couple common header variants.
    Expected headers ideally: date,amount,merchant,description,account,category
    """
    # tolerate a few common alternatives
    merchant = row.get("merchant") or row.get("payee") or row.get("name")
    desc = row.get("description") or row.get("memo") or row.get("note")
    account = row.get("account") or row.get("account_name")

    dt = _parse_date(str(row["date"]))
    amount = float(str(row["amount"]).replace(",", ""))

    return Transaction(
        date=dt,
        merchant=(merchant or None),
        description=(desc or None),
        amount=amount,
        category=(row.get("category") or None),
        account=(account or None),
        month=dt.strftime("%Y-%m"),
    )


def seed(csv_path: Path, replace: bool = False) -> int:
    sess: Session = SessionLocal()
    try:
        if replace:
            sess.query(Transaction).delete()
            sess.commit()

        added = 0
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                raise ValueError("CSV appears to have no header row.")

            for row in reader:
                txn = _row_to_txn(row)
                sess.add(txn)
                added += 1
            sess.commit()

        # --- Mark a few transactions as "unknown" for demo/testing ---
        # Choose a target month (latest present), and pick N deterministic rows within that month.
        target_month = sess.query(func.max(Transaction.month)).scalar()
        # Count knob via env var (default 7)
        try:
            desired = int(os.getenv("DEV_UNKNOWN_COUNT", "7"))
        except Exception:
            desired = 7

        if target_month:
            ids = [row[0] for row in sess.query(Transaction.id).filter(Transaction.month == target_month).all()]
        else:
            ids = [row[0] for row in sess.query(Transaction.id).all()]

        if ids:
            seed_bytes = hashlib.md5((target_month or "ALL").encode("utf-8")).digest()[:8]
            random.seed(int.from_bytes(seed_bytes, "big"))
            N = min(desired, len(ids))
            for txn_id in random.sample(ids, N):
                txn = sess.get(Transaction, txn_id)
                if txn:
                    txn.category = None
                    # Guard if model lacks raw_category
                    if hasattr(txn, "raw_category"):
                        txn.raw_category = None
            sess.commit()

        return added
    finally:
        sess.close()


def main():
    parser = argparse.ArgumentParser(description="Seed demo transactions into the current DATABASE_URL.")
    parser.add_argument(
        "csv",
        nargs="?",
        type=Path,
        default=None,
        help="Path to CSV (defaults to app/data/samples/transactions_sample.csv)",
    )
    parser.add_argument("--replace", action="store_true", help="Delete existing transactions before seeding")
    args = parser.parse_args()

    csv_path = args.csv or _default_sample_csv()
    if not csv_path.exists():
        parser.error(f"CSV not found: {csv_path}")

    added = seed(csv_path, replace=args.replace)
    print(f"Seeded {added} transactions from {csv_path}")


if __name__ == "__main__":
    main()
