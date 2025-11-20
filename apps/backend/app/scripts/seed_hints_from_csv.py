"""
Seed merchant_category_hints from a labeled CSV file.

Usage:
    python -m app.scripts.seed_hints_from_csv /path/to/sample.csv

CSV Format:
    date,description,merchant,amount,category
    2025-10-01,NETFLIX.COM,NETFLIX,-15.99,subscriptions
    2025-10-02,STEAM PURCHASE,STEAM GAMES,-59.99,games
    ...

This script:
1. Reads the CSV and counts (merchant, category) pairs
2. Calculates confidence based on:
   - Ratio of category for that merchant (consistency)
   - Volume of occurrences (more data = higher confidence)
3. Upserts into merchant_category_hints table
"""

import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import text
from app.db import SessionLocal

CSV_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/app/data/seed_hints.csv")


def main() -> None:
    print(f"[seed_hints] Reading from {CSV_PATH}")

    if not CSV_PATH.exists():
        print(f"[seed_hints] ERROR: File not found: {CSV_PATH}")
        sys.exit(1)

    # Count occurrences of each (merchant, category) pair
    counts: dict[tuple[str, str], int] = Counter()
    totals: defaultdict[str, int] = defaultdict(int)

    with CSV_PATH.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            merchant = (row.get("merchant") or row.get("description") or "").strip()
            category = (row.get("category") or "").strip().lower()
            if not merchant or not category:
                continue
            key = (merchant.lower(), category)
            counts[key] += 1
            totals[merchant.lower()] += 1

    print(f"[seed_hints] Found {len(counts)} unique (merchant, category) pairs")

    session = SessionLocal()
    try:
        for (merchant_norm, category), cnt in counts.items():
            total = totals[merchant_norm]
            ratio = cnt / total if total else 0.0

            # Confidence calculation:
            # - Base: 0.4
            # - Consistency bonus: up to 0.4 based on ratio
            # - Volume bonus: up to 0.2 based on occurrence count (caps at 10)
            confidence = min(0.99, 0.4 + 0.4 * ratio + 0.2 * min(1.0, cnt / 10.0))

            # Upsert into merchant_category_hints using raw SQL
            session.execute(
                text(
                    """
                    INSERT INTO merchant_category_hints
                        (merchant_canonical, category_slug, source, confidence)
                    VALUES
                        (:merchant, :category, :source, :confidence)
                    ON CONFLICT (merchant_canonical, category_slug) DO UPDATE
                    SET
                        confidence = GREATEST(merchant_category_hints.confidence, EXCLUDED.confidence),
                        source = COALESCE(merchant_category_hints.source, EXCLUDED.source)
                    """
                ),
                {
                    "merchant": merchant_norm,
                    "category": category,
                    "source": "seed_csv",
                    "confidence": confidence,
                },
            )
            print(
                f"[seed_hints] Processed: {merchant_norm} → {category} (conf={confidence:.2f})"
            )

        session.commit()
        print(
            f"[seed_hints] SUCCESS: Seeded {len(counts)} merchant hints from {CSV_PATH}"
        )
    except Exception as e:
        print(f"[seed_hints] ERROR: {e}")
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
