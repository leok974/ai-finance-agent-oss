# apps/backend/app/scripts/seed_demo.py
from __future__ import annotations

import csv
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from sqlalchemy.orm import Session

from app.db import SessionLocal, Base, engine
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
    # Ensure DB schema exists (useful for fresh SQLite files)
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        # Non-fatal: if migrations manage schema elsewhere, continue
        pass
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
