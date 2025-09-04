# apps/backend/app/scripts/dev_seed_and_backfill.py
from __future__ import annotations

import argparse
from pathlib import Path

from app.scripts.seed_demo import seed as seed_demo, _default_sample_csv
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

    print(
        f"Done. Seeded {added} transactions from {csv_path}. "
        f"Backfilled {updated} rows."
    )


if __name__ == "__main__":
    main()
