"""Analyze P2P training data CSV.

This script reads the CSV exported by export_p2p_training.py and prints
useful statistics: counts, amount distribution, merchant/source breakdown.
"""

from __future__ import annotations

import argparse
import csv
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median


@dataclass
class P2PRow:
    """Represents a single P2P training row."""

    txn_id: int
    date: str
    month: str
    amount: float
    merchant: str
    description: str
    category: str
    normalized_merchant: str
    merchant_kind: str


def load_p2p_rows(path: Path) -> list[P2PRow]:
    """Load P2P rows from CSV file.

    Args:
        path: Path to p2p_training.csv

    Returns:
        List of P2PRow dataclass instances
    """
    rows: list[P2PRow] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            try:
                amount = float(raw.get("amount") or 0.0)
            except ValueError:
                amount = math.nan

            rows.append(
                P2PRow(
                    txn_id=int(raw.get("txn_id") or 0),
                    date=(raw.get("date") or "").strip(),
                    month=(raw.get("month") or "").strip(),
                    amount=amount,
                    merchant=(raw.get("merchant") or "").strip(),
                    description=(raw.get("description") or "").strip(),
                    category=(raw.get("category") or "").strip(),
                    normalized_merchant=(raw.get("normalized_merchant") or "").strip(),
                    merchant_kind=(raw.get("merchant_kind") or "").strip(),
                )
            )
    return rows


def describe_amounts(amounts: list[float]) -> dict[str, float]:
    """Calculate descriptive statistics for amount distribution.

    Args:
        amounts: List of transaction amounts

    Returns:
        Dictionary with count, min, max, mean, median, p90, p95
    """
    clean = [a for a in amounts if not math.isnan(a)]
    if not clean:
        return {}

    sorted_vals = sorted(clean)
    n = len(sorted_vals)

    def p(q: float) -> float:
        """Calculate percentile."""
        idx = min(n - 1, max(0, int(q * (n - 1))))
        return sorted_vals[idx]

    return {
        "count": n,
        "min": sorted_vals[0],
        "max": sorted_vals[-1],
        "mean": mean(sorted_vals),
        "median": median(sorted_vals),
        "p90": p(0.9),
        "p95": p(0.95),
    }


def analyze_p2p_training(path: Path) -> None:
    """Analyze P2P training CSV and print statistics.

    Args:
        path: Path to p2p_training.csv file
    """
    rows = load_p2p_rows(path)
    if not rows:
        print(f"⚠️ No rows found in {path}")
        return

    print(f"\n📊 P2P training analysis for {path}")
    print("====================================")

    # 1) Overall counts
    total = len(rows)
    categories = Counter(r.category for r in rows)
    merchants = Counter(r.normalized_merchant or r.merchant for r in rows)

    print(f"\nTotal rows: {total}")
    print("Categories:")
    for cat, c in categories.most_common():
        print(f"  - {cat or '(empty)'}: {c}")

    print("\nTop 10 merchants (normalized fallback → raw):")
    for m, c in merchants.most_common(10):
        print(f"  - {m or '(empty)'}: {c}")

    # 2) Amount stats
    amounts = [r.amount for r in rows]
    stats = describe_amounts(amounts)
    if stats:
        print("\nAmount stats (all rows):")
        print(f"  count : {stats['count']}")
        print(f"  min   : {stats['min']:.2f}")
        print(f"  max   : {stats['max']:.2f}")
        print(f"  mean  : {stats['mean']:.2f}")
        print(f"  median: {stats['median']:.2f}")
        print(f"  p90   : {stats['p90']:.2f}")
        print(f"  p95   : {stats['p95']:.2f}")

    # 3) Amount stats per merchant (top N only)
    by_merchant: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        key = r.normalized_merchant or r.merchant or "(empty)"
        by_merchant[key].append(r.amount)

    print("\nPer-merchant amount stats (top 5 merchants by count):")
    for merchant, _ in merchants.most_common(5):
        vals = by_merchant[merchant]
        mstats = describe_amounts(vals)
        if not mstats:
            continue
        print(f"  • {merchant}:")
        print(f"      n    = {mstats['count']}")
        print(f"      mean = {mstats['mean']:.2f}")
        print(f"      med  = {mstats['median']:.2f}")
        print(f"      p90  = {mstats['p90']:.2f}")

    # 4) Sample rows (small sanity peek)
    print("\nSample rows (up to 5):")
    for r in rows[:5]:
        print(
            f"  - #{r.txn_id} {r.date} {r.amount:.2f} | "
            f"{r.normalized_merchant or r.merchant}"
        )
    print("\n✅ Done.\n")


def main() -> None:
    """Main entry point for the analyzer."""
    parser = argparse.ArgumentParser(
        description="Analyze Transfers / P2P training CSV (p2p_training.csv)."
    )
    parser.add_argument(
        "--input",
        "-i",
        default="data/p2p_training.csv",
        help="Input CSV path (default: data/p2p_training.csv)",
    )
    args = parser.parse_args()
    path = Path(args.input)
    if not path.exists():
        print(f"❌ Input file not found: {path}")
        return
    analyze_p2p_training(path)


if __name__ == "__main__":
    main()
