"""Feature extraction for ML training.

Computes point-in-time features from raw transaction data and stores them
in ml_features table for reproducible training runs without data leakage.

Usage:
    # Build features for last 180 days
    python -m app.ml.feature_build --days 180

    # Build for specific date range
    python -m app.ml.feature_build --start-date 2025-01-01 --end-date 2025-10-31

    # Rebuild all features (slow!)
    python -m app.ml.feature_build --all
"""

import argparse
import re
from datetime import datetime, timedelta, date
from typing import Optional
import logging

from sqlalchemy import select, and_
from sqlalchemy.dialects.postgresql import insert

from app.db import get_db
from app.orm_models import Transaction
from app.ml.models import MLFeature
from app.ml.config import P2P_PATTERNS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Common subscription patterns
SUBSCRIPTION_PATTERNS = [
    r"\b(netflix|spotify|hulu|disney|prime|apple\s*music|youtube\s*premium)\b",
    r"\b(gym|fitness|planet\s*fitness)\b",
    r"\b(subscription|monthly\s*fee|recurring)\b",
]

# Merchant normalization patterns
NORMALIZE_PATTERNS = [
    (r"\s+", " "),  # Multiple spaces to single
    (r"[^\w\s-]", ""),  # Remove special chars except dash
    (r"\b(inc|llc|corp|ltd|co)\b", ""),  # Remove corporate suffixes
    (r"#\d+", ""),  # Remove store numbers
]


def normalize_description(text: Optional[str]) -> Optional[str]:
    """Normalize transaction description for feature extraction."""
    if not text:
        return None

    text = text.lower().strip()
    for pattern, replacement in NORMALIZE_PATTERNS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    return text.strip()


def is_subscription(merchant: Optional[str], description: Optional[str]) -> bool:
    """Heuristic to detect subscription-like transactions."""
    text = f"{merchant or ''} {description or ''}".lower()

    for pattern in SUBSCRIPTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True

    return False


def tokenize(text: Optional[str]) -> list[str]:
    """Simple whitespace tokenization."""
    if not text:
        return []

    # Normalize then split
    normalized = normalize_description(text)
    if not normalized:
        return []

    # Split on whitespace, filter short tokens
    tokens = [t for t in normalized.split() if len(t) > 2]
    return tokens[:20]  # Limit to 20 tokens


def is_p2p_transaction(text: str) -> bool:
    """Check if transaction text contains P2P patterns.

    Uses same patterns as merchant_normalizer for consistency.

    Args:
        text: Merchant name or description

    Returns:
        True if any P2P pattern matches
    """
    if not text:
        return False
    for pat in P2P_PATTERNS:
        if pat.search(text):
            return True
    return False


def extract_features(txn: Transaction) -> dict:
    """Extract feature vector from transaction.

    Returns dict compatible with MLFeature model fields.
    """
    # Temporal features
    dt = (
        txn.date
        if isinstance(txn.date, datetime)
        else datetime.combine(txn.date, datetime.min.time())
    )
    hour_of_day = None  # We don't have timestamp, only date
    dow = dt.weekday()  # 0=Monday
    is_weekend = dow >= 5

    # Amount features
    amount = float(txn.amount)
    abs_amount = abs(amount)

    # Month bucketing (yyyy-mm-01 for leakage-safe time-based splits)
    ts_month = date(dt.year, dt.month, 1)

    # Merchant/description features
    merchant = txn.merchant_canonical or txn.merchant
    norm_desc = normalize_description(txn.description)
    tokens = tokenize(f"{merchant} {txn.description}")

    # Heuristic features
    is_sub = is_subscription(merchant, txn.description)

    # P2P features (for Transfers / P2P category)
    combined_text = f"{merchant or ''} {txn.description or ''}"
    p2p_flag = 1 if is_p2p_transaction(combined_text) else 0
    p2p_large_outflow = 1 if (p2p_flag and amount < 0 and abs_amount >= 100) else 0

    # Channel detection (basic heuristics)
    channel = None
    if txn.description:
        desc_lower = txn.description.lower()
        if "ach" in desc_lower or "direct debit" in desc_lower:
            channel = "ach"
        elif "zelle" in desc_lower or "venmo" in desc_lower:
            channel = "zelle"
        elif "deposit" in desc_lower or "payroll" in desc_lower:
            channel = "deposit"
        elif "online" in desc_lower or "web" in desc_lower:
            channel = "online"
        else:
            channel = "pos"  # Default to point-of-sale

    return {
        "txn_id": txn.id,
        "ts_month": ts_month,
        "amount": amount,
        "abs_amount": abs_amount,
        "merchant": merchant,
        "mcc": None,  # Not available in current schema
        "channel": channel,
        "hour_of_day": hour_of_day,
        "dow": dow,
        "is_weekend": is_weekend,
        "is_subscription": is_sub,
        "norm_desc": norm_desc,
        "tokens": tokens,
        "feat_p2p_flag": p2p_flag,
        "feat_p2p_large_outflow": p2p_large_outflow,
    }


def build_features(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    days: Optional[int] = None,
    batch_size: int = 1000,
) -> int:
    """Build features for transactions in date range.

    Args:
        start_date: Start date (inclusive). If None, uses days parameter.
        end_date: End date (inclusive). If None, uses today.
        days: Number of days back from end_date. Ignored if start_date given.
        batch_size: Number of transactions to process per batch.

    Returns:
        Number of feature records created/updated.
    """
    if end_date is None:
        end_date = date.today()

    if start_date is None:
        if days is None:
            days = 180
        start_date = end_date - timedelta(days=days)

    logger.info(f"Building features for {start_date} to {end_date}")

    db = next(get_db())
    try:
        # Query transactions in date range
        stmt = (
            select(Transaction)
            .where(
                and_(
                    Transaction.date >= start_date,
                    Transaction.date <= end_date,
                    Transaction.deleted_at.is_(None),  # Skip soft-deleted
                )
            )
            .order_by(Transaction.id)
        )

        count = 0
        batch = []

        for txn in db.execute(stmt).scalars():
            features = extract_features(txn)
            batch.append(features)

            if len(batch) >= batch_size:
                # Bulk upsert
                stmt = insert(MLFeature).values(batch)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["txn_id"],
                    set_=dict(
                        ts_month=stmt.excluded.ts_month,
                        amount=stmt.excluded.amount,
                        abs_amount=stmt.excluded.abs_amount,
                        merchant=stmt.excluded.merchant,
                        mcc=stmt.excluded.mcc,
                        channel=stmt.excluded.channel,
                        hour_of_day=stmt.excluded.hour_of_day,
                        dow=stmt.excluded.dow,
                        is_weekend=stmt.excluded.is_weekend,
                        is_subscription=stmt.excluded.is_subscription,
                        norm_desc=stmt.excluded.norm_desc,
                        tokens=stmt.excluded.tokens,
                        feat_p2p_flag=stmt.excluded.feat_p2p_flag,
                        feat_p2p_large_outflow=stmt.excluded.feat_p2p_large_outflow,
                    ),
                )
                db.execute(stmt)
                db.commit()

                count += len(batch)
                logger.info(f"Processed {count} transactions")
                batch = []

        # Process remaining batch
        if batch:
            stmt = insert(MLFeature).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["txn_id"],
                set_=dict(
                    ts_month=stmt.excluded.ts_month,
                    amount=stmt.excluded.amount,
                    abs_amount=stmt.excluded.abs_amount,
                    merchant=stmt.excluded.merchant,
                    mcc=stmt.excluded.mcc,
                    channel=stmt.excluded.channel,
                    hour_of_day=stmt.excluded.hour_of_day,
                    dow=stmt.excluded.dow,
                    is_weekend=stmt.excluded.is_weekend,
                    is_subscription=stmt.excluded.is_subscription,
                    norm_desc=stmt.excluded.norm_desc,
                    tokens=stmt.excluded.tokens,
                    feat_p2p_flag=stmt.excluded.feat_p2p_flag,
                    feat_p2p_large_outflow=stmt.excluded.feat_p2p_large_outflow,
                ),
            )
            db.execute(stmt)
            db.commit()
            count += len(batch)

        logger.info(f"✅ Built {count} feature vectors")
        return count

    finally:
        db.close()


def main():
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Build ML features from transactions")
    parser.add_argument(
        "--days",
        type=int,
        default=180,
        help="Number of days back to process (default: 180)",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        help="Start date (YYYY-MM-DD). Overrides --days",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        help="End date (YYYY-MM-DD). Defaults to today",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all transactions (ignores date filters)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Batch size for bulk inserts (default: 1000)",
    )

    args = parser.parse_args()

    start_date = None
    end_date = None
    days = None

    if args.all:
        # Process everything
        start_date = date(2000, 1, 1)  # Arbitrary old date
        end_date = date.today()
    else:
        if args.start_date:
            start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
        if args.end_date:
            end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()
        if not args.start_date:
            days = args.days

    count = build_features(
        start_date=start_date,
        end_date=end_date,
        days=days,
        batch_size=args.batch_size,
    )

    print(f"\n✅ Successfully built {count} feature vectors")


if __name__ == "__main__":
    main()
