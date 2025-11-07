"""Merchant-based category labeling using majority voting.

Provides high-confidence category suggestions based on historical
transaction labels for a given merchant.

Works with either user_labels or transaction_labels table (schema-agnostic).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.orm_models import Transaction

# Try both label tables gracefully
try:
    from app.orm_models import UserLabel as LabelTable

    LABEL_COL = "category"
except Exception:
    try:
        from app.orm_models import TransactionLabel as LabelTable

        LABEL_COL = "label"
    except Exception:
        LabelTable = None
        LABEL_COL = None

# Tunables
MIN_SUPPORT = 3  # Minimum number of labeled transactions
MAJORITY_P = 0.70  # Minimum proportion for majority label


@dataclass
class MerchantMajority:
    """Result of majority voting for a merchant."""

    label: str
    p: float
    support: int
    total: int


def majority_for_merchant(db: Session, merchant: str) -> Optional[MerchantMajority]:
    """Calculate majority category label for a merchant.

    Args:
        db: Database session
        merchant: Merchant name to analyze

    Returns:
        MerchantMajority if criteria met, None otherwise
    """
    if not merchant or LabelTable is None:
        return None

    # SELECT label, COUNT(*) FROM labels JOIN transactions ON ...
    # WHERE lower(merchant)=... GROUP BY label
    label_attr = getattr(LabelTable, LABEL_COL)
    q = (
        select(label_attr.label("lbl"), func.count().label("cnt"))
        .join(Transaction, Transaction.id == LabelTable.txn_id)
        .where(func.lower(Transaction.merchant) == merchant.lower())
        .group_by(label_attr)
    )
    rows = db.execute(q).all()

    if not rows:
        return None

    total = sum(r.cnt for r in rows)
    lbl, cnt = max(((r.lbl, r.cnt) for r in rows), key=lambda x: x[1])
    p = cnt / max(total, 1)

    if cnt >= MIN_SUPPORT and p >= MAJORITY_P:
        return MerchantMajority(
            label=str(lbl),
            p=round(p, 3),
            support=int(cnt),
            total=int(total),
        )

    return None


def suggest_from_majority(db: Session, txn) -> Optional[Tuple[str, float, dict]]:
    """Generate suggestion based on merchant majority voting.

    Args:
        db: Database session
        txn: Transaction object or dict with merchant field

    Returns:
        Tuple of (label, confidence, reason_json) or None
    """
    # Handle both dict and ORM object
    merchant = txn.get("merchant") if isinstance(txn, dict) else txn.merchant
    maj = majority_for_merchant(db, merchant)
    if not maj:
        return None

    reason = {
        "source": "merchant_majority",
        "merchant": merchant,
        "support": maj.support,
        "total": maj.total,
        "p": maj.p,
    }
    return maj.label, maj.p, reason
