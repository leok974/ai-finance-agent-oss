#!/usr/bin/env python
"""Generate sample labeled training data for ML suggestions.

This script creates a synthetic dataset of transactions with labeled categories
for training the suggestion model. In production, use real transaction data
with user-confirmed categories.

Usage:
    python -m app.ml.generate_sample_data [--output PATH] [--n-samples N]
"""

from __future__ import annotations
import argparse
import random
from pathlib import Path
from datetime import datetime, timedelta

import pandas as pd

# Import feature extraction to ensure alignment
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from services.suggest.features import extract_features, FEATURE_NAMES


# Sample merchant data with labels
SAMPLE_DATA = [
    # Groceries
    {
        "merchant": "COSTCO WHOLESALE #0085",
        "memo": "Weekly grocery shopping",
        "category": "Groceries",
        "amount_range": (-150, -50),
    },
    {
        "merchant": "WHOLE FOODS MARKET",
        "memo": "Organic produce and meat",
        "category": "Groceries",
        "amount_range": (-120, -40),
    },
    {
        "merchant": "TRADER JOE'S",
        "memo": "Grocery run",
        "category": "Groceries",
        "amount_range": (-80, -30),
    },
    {
        "merchant": "SAFEWAY",
        "memo": "Weekly shopping",
        "category": "Groceries",
        "amount_range": (-100, -40),
    },
    # Dining
    {
        "merchant": "STARBUCKS",
        "memo": "Morning coffee",
        "category": "Dining",
        "amount_range": (-8, -3),
    },
    {
        "merchant": "CHIPOTLE",
        "memo": "Lunch",
        "category": "Dining",
        "amount_range": (-15, -8),
    },
    {
        "merchant": "DOMINOS PIZZA",
        "memo": "Dinner delivery",
        "category": "Dining",
        "amount_range": (-30, -15),
    },
    {
        "merchant": "THE CHEESECAKE FACTORY",
        "memo": "Dinner out",
        "category": "Dining",
        "amount_range": (-80, -40),
    },
    # Transportation
    {
        "merchant": "UBER TRIP",
        "memo": "Ride to airport",
        "category": "Transportation",
        "amount_range": (-50, -15),
    },
    {
        "merchant": "LYFT",
        "memo": "Ride home",
        "category": "Transportation",
        "amount_range": (-30, -10),
    },
    {
        "merchant": "SHELL OIL",
        "memo": "Gas station",
        "category": "Transportation",
        "amount_range": (-60, -30),
    },
    {
        "merchant": "CHEVRON",
        "memo": "Fuel",
        "category": "Transportation",
        "amount_range": (-55, -30),
    },
    # Entertainment
    {
        "merchant": "NETFLIX.COM",
        "memo": "Monthly subscription",
        "category": "Entertainment",
        "amount_range": (-20, -10),
    },
    {
        "merchant": "SPOTIFY",
        "memo": "Premium subscription",
        "category": "Entertainment",
        "amount_range": (-12, -8),
    },
    {
        "merchant": "AMC THEATRES",
        "memo": "Movie night",
        "category": "Entertainment",
        "amount_range": (-40, -15),
    },
    {
        "merchant": "STEAM GAMES",
        "memo": "Video game purchase",
        "category": "Entertainment",
        "amount_range": (-60, -10),
    },
    # Shopping
    {
        "merchant": "AMAZON.COM",
        "memo": "Online order",
        "category": "Shopping",
        "amount_range": (-100, -15),
    },
    {
        "merchant": "TARGET",
        "memo": "General shopping",
        "category": "Shopping",
        "amount_range": (-80, -20),
    },
    {
        "merchant": "WALMART",
        "memo": "Household items",
        "category": "Shopping",
        "amount_range": (-70, -25),
    },
    {
        "merchant": "BEST BUY",
        "memo": "Electronics",
        "category": "Shopping",
        "amount_range": (-500, -50),
    },
    # Healthcare
    {
        "merchant": "CVS PHARMACY",
        "memo": "Prescription pickup",
        "category": "Healthcare",
        "amount_range": (-50, -10),
    },
    {
        "merchant": "WALGREENS",
        "memo": "Pharmacy",
        "category": "Healthcare",
        "amount_range": (-40, -10),
    },
    {
        "merchant": "24 HOUR FITNESS",
        "memo": "Gym membership",
        "category": "Healthcare",
        "amount_range": (-60, -30),
    },
    {
        "merchant": "KAISER PERMANENTE",
        "memo": "Medical copay",
        "category": "Healthcare",
        "amount_range": (-100, -20),
    },
    # Transfers
    {
        "merchant": "ZELLE PAYMENT",
        "memo": "Sent to roommate for rent",
        "category": "Transfer",
        "amount_range": (-1000, -500),
    },
    {
        "merchant": "VENMO",
        "memo": "Split dinner bill",
        "category": "Transfer",
        "amount_range": (-50, -10),
    },
    # Utilities
    {
        "merchant": "PG&E",
        "memo": "Electric bill",
        "category": "Utilities",
        "amount_range": (-150, -60),
    },
    {
        "merchant": "COMCAST",
        "memo": "Internet service",
        "category": "Utilities",
        "amount_range": (-90, -50),
    },
    # Income (positive amounts)
    {
        "merchant": "DIRECT DEPOSIT PAYROLL",
        "memo": "Bi-weekly paycheck",
        "category": "Income",
        "amount_range": (2000, 4000),
    },
    {
        "merchant": "VENMO",
        "memo": "Payment received",
        "category": "Income",
        "amount_range": (10, 100),
    },
]


def generate_sample_transactions(n_samples: int = 1000, seed: int = 42) -> pd.DataFrame:
    """Generate synthetic transaction data with labels.

    Args:
        n_samples: Number of transactions to generate
        seed: Random seed for reproducibility

    Returns:
        DataFrame with transaction features + label
    """
    random.seed(seed)

    transactions = []
    base_date = datetime.now() - timedelta(days=365)

    for i in range(n_samples):
        # Sample a transaction template
        template = random.choice(SAMPLE_DATA)

        # Generate random amount in range
        min_amt, max_amt = template["amount_range"]
        amount = round(random.uniform(min_amt, max_amt), 2)

        # Add some variance to merchant name
        merchant = template["merchant"]
        if random.random() < 0.3:  # 30% chance of adding location
            merchant += f" #{random.randint(1, 999):04d}"

        # Create transaction dict
        txn = {
            "id": i + 1,
            "merchant": merchant,
            "memo": template["memo"],
            "amount": amount,
            "label": template["category"],
            "date": (base_date + timedelta(days=random.randint(0, 365))).isoformat(),
        }

        # Extract features
        features = extract_features(txn)

        # Combine transaction info + features
        row = {**features, "label": txn["label"]}
        transactions.append(row)

    df = pd.DataFrame(transactions)

    # Ensure feature columns are in correct order
    cols = FEATURE_NAMES + ["label"]
    df = df[cols]

    return df


def main():
    parser = argparse.ArgumentParser(description="Generate sample training data")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/golden/txns_labeled.parquet"),
        help="Output path for labeled data",
    )
    parser.add_argument(
        "--n-samples", type=int, default=1000, help="Number of samples to generate"
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument(
        "--format", choices=["parquet", "csv"], default="parquet", help="Output format"
    )

    args = parser.parse_args()

    print(f"[generate] Creating {args.n_samples} sample transactions...")
    df = generate_sample_transactions(n_samples=args.n_samples, seed=args.seed)

    print(f"[generate] Shape: {df.shape}")
    print(f"[generate] Categories: {df['label'].nunique()}")
    print("\n[generate] Category distribution:")
    print(df["label"].value_counts())

    # Create output directory
    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Save
    if args.format == "parquet":
        df.to_parquet(args.output, index=False)
    else:
        csv_path = args.output.with_suffix(".csv")
        df.to_csv(csv_path, index=False)
        args.output = csv_path

    print(f"\n[SUCCESS] Saved {len(df)} samples to {args.output}")
    print(
        f"[INFO] Features: {', '.join(FEATURE_NAMES[:5])} ... ({len(FEATURE_NAMES)} total)"
    )

    return 0


if __name__ == "__main__":
    exit(main())
