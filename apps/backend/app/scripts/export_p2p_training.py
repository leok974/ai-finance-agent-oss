"""Export P2P training data from label_events to CSV.

This script extracts all transactions labeled as 'Transfers / P2P' and exports
them to CSV format for inspection and ML training purposes.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.transactions import Transaction
from app.orm_models import UserLabel


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    """Parse date string in YYYY-MM or YYYY-MM-DD format."""
    if not s:
        return None
    # Accept YYYY-MM-DD or YYYY-MM
    if len(s) == 7:
        return datetime.strptime(s + "-01", "%Y-%m-%d")
    return datetime.strptime(s, "%Y-%m-%d")


def export_p2p_training(
    session: Session,
    out_path: Path,
    min_date: Optional[datetime] = None,
    max_date: Optional[datetime] = None,
    limit: Optional[int] = None,
) -> int:
    """Export all transactions labeled 'Transfers / P2P' into a CSV.

    CSV columns:
        txn_id, date, amount, merchant, description, category, month,
        normalized_merchant, merchant_kind

    Args:
        session: Database session
        out_path: Output CSV file path
        min_date: Optional minimum transaction date filter
        max_date: Optional maximum transaction date filter
        limit: Optional maximum number of rows to export

    Returns:
        Number of rows exported
    """
    # Query transactions with P2P category from user_labels
    q = (
        session.query(UserLabel, Transaction)
        .join(Transaction, UserLabel.txn_id == Transaction.id)
        .filter(UserLabel.category == "Transfers / P2P")
        .order_by(Transaction.date.asc())
    )

    if min_date is not None:
        q = q.filter(Transaction.date >= min_date.date())
    if max_date is not None:
        q = q.filter(Transaction.date <= max_date.date())
    if limit is not None:
        q = q.limit(limit)

    rows = q.all()

    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "txn_id",
                "date",
                "month",
                "amount",
                "merchant",
                "description",
                "category",
                "normalized_merchant",
                "merchant_kind",
            ]
        )

        for label, txn in rows:
            writer.writerow(
                [
                    txn.id,
                    txn.date.isoformat() if txn.date else "",
                    getattr(txn, "month", "") or "",
                    float(txn.amount),
                    (txn.merchant or "").strip(),
                    (txn.description or "").strip(),
                    label.category,
                    getattr(txn, "merchant_normalized", "") or "",
                    getattr(txn, "merchant_kind", "") or "",
                ]
            )

    return len(rows)


def main() -> None:
    """Main entry point for the export script."""
    parser = argparse.ArgumentParser(
        description="Export Transfers / P2P training rows from user_labels → CSV"
    )
    parser.add_argument(
        "--output",
        "-o",
        default="data/p2p_training.csv",
        help="Output CSV path (default: data/p2p_training.csv)",
    )
    parser.add_argument(
        "--min-date",
        help="Minimum transaction date (YYYY-MM or YYYY-MM-DD)",
    )
    parser.add_argument(
        "--max-date",
        help="Maximum transaction date (YYYY-MM or YYYY-MM-DD)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of rows to export (default: no limit)",
    )

    args = parser.parse_args()
    out_path = Path(args.output)
    min_date = _parse_date(args.min_date)
    max_date = _parse_date(args.max_date)

    session = SessionLocal()
    try:
        count = export_p2p_training(
            session,
            out_path=out_path,
            min_date=min_date,
            max_date=max_date,
            limit=args.limit,
        )
        print(f"✅ Exported {count} Transfers / P2P rows to {out_path}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
