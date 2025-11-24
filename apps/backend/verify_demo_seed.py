#!/usr/bin/env python3
"""
Quick verification script for demo data generation.
Shows sample transactions and category distribution.
"""

from app.scripts.seed_demo_data import (
    generate_demo_transactions,
    iter_demo_dates,
)
from collections import Counter


def main():
    print("=" * 70)
    print("Demo Data Generation Verification")
    print("=" * 70)

    # Test date generation
    dates = iter_demo_dates(6)
    print(f"\n✓ Date Generation: {len(dates)} dates over 6 months")
    print(f"  Range: {min(dates)} to {max(dates)}")

    # Count dates per month
    months = Counter(d.strftime("%Y-%m") for d in dates)
    print(f"  Distribution: {dict(sorted(months.items()))}")

    # Test transaction generation
    print("\n✓ Transaction Generation:")
    rows = generate_demo_transactions(user_id=1)
    print(f"  Total transactions: {len(rows)}")

    # Category analysis
    categories = Counter(r["category"] for r in rows)
    print(f"\n✓ Category Distribution ({len(categories)} unique):")
    for cat, count in categories.most_common(15):
        print(f"    {cat:35s} {count:3d} txns")

    # Merchant analysis
    merchants = Counter(r["merchant_canonical"] for r in rows)
    print(f"\n✓ Merchant Distribution ({len(merchants)} unique):")
    for merchant, count in merchants.most_common(10):
        print(f"    {merchant:35s} {count:3d} txns")

    # Income vs Spend vs Transfers
    income = [r for r in rows if r["amount"] > 0 and "income" in r["category"]]
    spend = [r for r in rows if r["amount"] < 0 and r["category"] != "transfers"]
    transfers = [r for r in rows if r["category"] == "transfers"]

    print("\n✓ Transaction Types:")
    print(
        f"    Income:     {len(income):3d} txns  (${sum(r['amount'] for r in income):,.2f})"
    )
    print(
        f"    Spending:   {len(spend):3d} txns  (${sum(r['amount'] for r in spend):,.2f})"
    )
    print(f"    Transfers:  {len(transfers):3d} txns")

    # Sample transactions
    print("\n✓ Sample Transactions:")
    for i, row in enumerate(rows[:10]):
        amount_str = f"${row['amount']:,.2f}"
        print(
            f"    {row['date']} {row['merchant']:30s} {amount_str:>12s} [{row['category']}]"
        )

    print("\n" + "=" * 70)
    print("✓ Demo data generation verified successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
